import type { Env } from "./db";
import { AwsClient } from "aws4fetch";

interface EmailData {
  to: string;
  subject: string;
  html: string;
}

interface EmailConfig {
  provider: "sendgrid" | "resend" | "mailgun" | "ses" | "custom";
  apiKey?: string;
  domain?: string;        // mailgun 专用
  accessKeyId?: string;   // ses 专用
  secretAccessKey?: string; // ses 专用
  region?: string;        // ses 专用
  configurationSetName?: string; // ses 专用，可选
  webhookUrl?: string;    // custom 专用
  sender: string;
}

function parseSender(sender: string): { email: string; name?: string } {
  const match = sender.match(/^(.*?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: sender.trim() };
}

async function loadEmailConfig(env: Env): Promise<EmailConfig | null> {
  // Try loading from DB settings
  try {
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'email_config'").first();
    if (row && row.value && (row.value as string).trim()) {
      const config = JSON.parse(row.value as string) as EmailConfig;
      if (config.provider && config.sender) return config;
      console.warn("[Email] email_config found but missing provider or sender:", row.value);
    }
  } catch (err: any) {
    console.error("[Email] Failed to parse email_config from DB:", err.message);
  }

  // Fallback: use env vars as SendGrid config
  if (env.SENDGRID_API_KEY) {
    return {
      provider: "sendgrid",
      apiKey: env.SENDGRID_API_KEY,
      sender: env.SENDGRID_SENDER || "noreply@jsmsr.com",
    };
  }

  console.warn("[Email] No email provider configured! Set email_config in Settings > Email, or add SENDGRID_API_KEY secret.");
  return null;
}

// --- AWS Signature V4 Signing ---

async function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const keyImport = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", keyImport, new TextEncoder().encode(data)));
}

async function sha256(data: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)));
}

function toHex(data: Uint8Array): string {
  return Array.from(data).map(b => b.toString(16).padStart(2, "0")).join("");
}

function getAmzDate(date: Date): string {
  return date.toISOString().replace(/[:\-]|\.\d{3}/g, "");
}

async function signAWS(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  service: string,
  method: string,
  path: string,
  headers: Record<string, string>,
  body: string,
  host: string
): Promise<Record<string, string>> {
  // Trim credentials to remove any accidental whitespace/invisible chars
  const cleanKeyId = accessKeyId.trim();
  const cleanSecret = secretAccessKey.trim();
  const cleanRegion = region.trim();

  const now = new Date();
  const amzDate = getAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);

  // x-amz-date is generated internally and must be part of the signed headers
  const allHeaders: Record<string, string> = {
    ...headers,
    "X-Amz-Date": amzDate,
  };

  // Canonical request - build headers with explicit \n on each line
  const sortedHeaderKeys = Object.keys(allHeaders).sort();
  // Each header line MUST end with \n (including the last one)
  const canonicalHeaders = sortedHeaderKeys
    .map(k => `${k.toLowerCase()}:${allHeaders[k].trim()}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys.map(k => k.toLowerCase()).join(";");
  const payloadHash = toHex(await sha256(body));
  // canonicalHeaders already ends with \n, then add another \n (empty line) before signedHeaders
  const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  // Debug logging for signature verification - use JSON.stringify to show real \n
  console.log("[SES-SIG] canonicalRequest(JSON):", JSON.stringify(canonicalRequest));
  console.log("[SES-SIG] signedHeaders:", signedHeaders);
  console.log("[SES-SIG] payloadHash:", payloadHash);

  // String to sign
  const credentialScope = `${dateStamp}/${cleanRegion}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${toHex(await sha256(canonicalRequest))}`;

  console.log("[SES-SIG] stringToSign(JSON):", JSON.stringify(stringToSign));
  console.log("[SES-SIG] credentialScope:", credentialScope);

  // Calculate signature
  const kSecret = new TextEncoder().encode("AWS4" + cleanSecret);
  const kDate = await hmacSha256(kSecret, dateStamp);
  const kRegion = await hmacSha256(kDate, cleanRegion);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  // Authorization header
  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${cleanKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    "Authorization": authorizationHeader,
    "X-Amz-Date": amzDate,
  };
}

// --- Provider-specific senders ---

async function sendViaSendGrid(config: EmailConfig, data: EmailData): Promise<{ ok: boolean; error?: string }> {
  if (!config.apiKey) return { ok: false, error: "SendGrid API key not configured" };
  const from = parseSender(config.sender);

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: data.to }] }],
      from,
      subject: data.subject,
      content: [{ type: "text/html", value: data.html }],
    }),
  });

  if (res.ok || res.status === 202) return { ok: true };
  const errBody = await res.text();
  return { ok: false, error: `SendGrid API error ${res.status}: ${errBody}` };
}

async function sendViaResend(config: EmailConfig, data: EmailData): Promise<{ ok: boolean; error?: string }> {
  if (!config.apiKey) return { ok: false, error: "Resend API key not configured" };
  const from = parseSender(config.sender);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: from.name ? `${from.name} <${from.email}>` : from.email,
      to: [data.to],
      subject: data.subject,
      html: data.html,
    }),
  });

  if (res.ok) return { ok: true };
  const errBody = await res.text();
  return { ok: false, error: `Resend API error ${res.status}: ${errBody}` };
}

async function sendViaMailgun(config: EmailConfig, data: EmailData): Promise<{ ok: boolean; error?: string }> {
  if (!config.apiKey || !config.domain) return { ok: false, error: "Mailgun API key or domain not configured" };
  const from = parseSender(config.sender);

  const form = new URLSearchParams();
  form.append("from", from.name ? `${from.name} <${from.email}>` : from.email);
  form.append("to", data.to);
  form.append("subject", data.subject);
  form.append("html", data.html);

  const res = await fetch(`https://api.mailgun.net/v3/${config.domain}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`api:${config.apiKey}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (res.ok) return { ok: true };
  const errBody = await res.text();
  return { ok: false, error: `Mailgun API error ${res.status}: ${errBody}` };
}

async function sendViaCustom(config: EmailConfig, data: EmailData): Promise<{ ok: boolean; error?: string }> {
  if (!config.webhookUrl) return { ok: false, error: "Custom webhook URL not configured" };

  const res = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: data.to,
      subject: data.subject,
      html: data.html,
      from: config.sender,
    }),
  });

  if (res.ok) return { ok: true };
  const errBody = await res.text();
  return { ok: false, error: `Webhook error ${res.status}: ${errBody}` };
}

async function sendViaSES(config: EmailConfig, data: EmailData): Promise<{ ok: boolean; error?: string }> {
  if (!config.accessKeyId || !config.secretAccessKey) return { ok: false, error: "AWS credentials not configured" };
  if (!config.region) return { ok: false, error: "AWS region not configured" };

  const host = `email.${config.region}.amazonaws.com`;
  // SES v2 API uses RESTful endpoint: /v2/email/outbound-emails
  const endpoint = `https://${host}/v2/email/outbound-emails`;
  const from = parseSender(config.sender);

  // SES v2 API JSON request body
  const sesBody: any = {
    FromEmailAddress: from.name ? `${from.name} <${from.email}>` : from.email,
    Destination: { ToAddresses: [data.to] },
    Content: {
      Simple: {
        Subject: { Data: data.subject },
        Body: { Html: { Data: data.html } },
      },
    },
  };

  if (config.configurationSetName) {
    sesBody.ConfigurationSetName = config.configurationSetName;
  }

  const bodyStr = JSON.stringify(sesBody);

  // Use aws4fetch for correct SigV4 signing in Cloudflare Workers
  // Credentials come from DB (configured via frontend), NOT env vars
  const cleanKeyId = config.accessKeyId.trim();
  const cleanSecret = config.secretAccessKey.trim();
  const cleanRegion = config.region.trim();

  console.log("[SES] accessKeyId (first 8):", cleanKeyId.substring(0, 8) + "...");
  console.log("[SES] secretAccessKey length:", cleanSecret.length);
  console.log("[SES] region:", cleanRegion);

  const aws = new AwsClient({
    accessKeyId: cleanKeyId,
    secretAccessKey: cleanSecret,
    region: cleanRegion,
    service: "ses",
  });

  console.log("[SES] endpoint:", endpoint);
  console.log("[SES] body:", bodyStr.substring(0, 150) + "...");

  const res = await aws.fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: bodyStr,
  });

  console.log("[SES] response:", res.status, res.statusText);

  if (res.ok) return { ok: true };

  let errMsg = `SES API error ${res.status}`;
  const errText = await res.text();
  try {
    const errJson = JSON.parse(errText);
    if (errJson.message) errMsg += `: ${errJson.message}`;
    else if (errText) errMsg += `: ${errText}`;
  } catch {
    if (errText) errMsg += `: ${errText}`;
  }

  return { ok: false, error: errMsg };
}

// --- Main send function ---

export async function sendEmail(env: Env, data: EmailData): Promise<{ ok: boolean; error?: string }> {
  const config = await loadEmailConfig(env);

  if (!config) {
    console.error("[Email] No email provider configured");
    return { ok: false, error: "No email provider configured. Please configure email in Settings > Email." };
  }

  try {
    let result: { ok: boolean; error?: string };

    switch (config.provider) {
      case "sendgrid":
        result = await sendViaSendGrid(config, data);
        break;
      case "resend":
        result = await sendViaResend(config, data);
        break;
      case "mailgun":
        result = await sendViaMailgun(config, data);
        break;
      case "ses":
        result = await sendViaSES(config, data);
        break;
      case "custom":
        result = await sendViaCustom(config, data);
        break;
      default:
        result = { ok: false, error: `Unknown email provider: ${config.provider}` };
    }

    if (result.ok) {
      console.log(`[Email:${config.provider}] Sent to ${data.to}: ${data.subject}`);
    } else {
      console.error(`[Email:${config.provider}] Failed: ${result.error}`);
    }

    return result;
  } catch (err: any) {
    console.error(`[Email:${config.provider}] Network error: ${err.message}`);
    return { ok: false, error: `Network error: ${err.message}` };
  }
}

export async function sendTestEmail(env: Env, to: string): Promise<{ ok: boolean; error?: string }> {
  return sendEmail(env, {
    to,
    subject: "[Ticket JSMSR Network] 測試郵件",
    html: "<h2>郵件測試成功</h2><p>這是一封測試郵件，表示您的郵件發送功能已正確配置。</p><p>發送時間: " + new Date().toISOString() + "</p>",
  });
}

export async function getEmailTemplate(db: D1Database, name: string, locale: string = 'zh'): Promise<{ subject: string; body: string } | null> {
  try {
    const tpl = await db.prepare("SELECT subject, body FROM email_templates WHERE name = ? AND locale = ?").bind(name, locale).first();
    return tpl ? { subject: tpl.subject as string, body: tpl.body as string } : null;
  } catch (err: any) {
    console.error(`[Email] Failed to get template "${name}" locale "${locale}": ${err.message}`);
    return null;
  }
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

async function getUserLocale(db: D1Database, email: string): Promise<string> {
  const user = await db.prepare("SELECT locale FROM users WHERE email = ?").bind(email).first();
  return (user?.locale as string) || 'zh';
}

// Fallback templates when DB templates are missing (per locale)
const FALLBACK_TEMPLATES: Record<string, Record<string, { subject: string; body: string }>> = {
  new_ticket: {
    en: {
      subject: "[Ticket System] New Ticket: {title}",
      body: "<h2>New Ticket Created</h2><p>Ticket ID: {ticket_id}</p><p>Title: {title}</p><p>Description: {description}</p><p>Priority: {priority}</p>",
    },
    zh: {
      subject: "[Ticket JSMSR Network] 新工單: {title}",
      body: "<h2>新工單已建立</h2><p>工單編號: {ticket_id}</p><p>標題: {title}</p><p>描述: {description}</p><p>優先級: {priority}</p>",
    },
    ja: {
      subject: "[チケットシステム] 新規チケット: {title}",
      body: "<h2>新規チケットが作成されました</h2><p>チケットID: {ticket_id}</p><p>件名: {title}</p><p>説明: {description}</p><p>優先度: {priority}</p>",
    },
  },
  ticket_reply: {
    en: {
      subject: "[Ticket System] Ticket Reply: {title}",
      body: "<h2>New Reply on Ticket</h2><p>Ticket ID: {ticket_id}</p><p>Title: {title}</p><p>Reply: {content}</p>",
    },
    zh: {
      subject: "[Ticket JSMSR Network] 工單回覆: {title}",
      body: "<h2>工單有新回覆</h2><p>工單編號: {ticket_id}</p><p>標題: {title}</p><p>回覆內容: {content}</p>",
    },
    ja: {
      subject: "[チケットシステム] チケット返信: {title}",
      body: "<h2>チケットに新しい返信があります</h2><p>チケットID: {ticket_id}</p><p>件名: {title}</p><p>返信内容: {content}</p>",
    },
  },
  ticket_closed: {
    en: {
      subject: "[Ticket System] Ticket Closed: {title}",
      body: "<h2>Ticket Closed</h2><p>Ticket ID: {ticket_id}</p><p>Title: {title}</p>",
    },
    zh: {
      subject: "[Ticket JSMSR Network] 工單已關閉: {title}",
      body: "<h2>工單已關閉</h2><p>工單編號: {ticket_id}</p><p>標題: {title}</p>",
    },
    ja: {
      subject: "[チケットシステム] チケット終了: {title}",
      body: "<h2>チケットが終了しました</h2><p>チケットID: {ticket_id}</p><p>件名: {title}</p>",
    },
  },
};

async function getTemplate(db: D1Database, name: string, locale: string = 'zh'): Promise<{ subject: string; body: string } | null> {
  const tpl = await getEmailTemplate(db, name, locale);
  if (tpl) return tpl;
  if (FALLBACK_TEMPLATES[name]?.[locale]) {
    console.log(`[Email] Using fallback template for "${name}" locale "${locale}"`);
    return FALLBACK_TEMPLATES[name][locale];
  }
  if (FALLBACK_TEMPLATES[name]?.['zh']) {
    console.log(`[Email] Using zh fallback for "${name}"`);
    return FALLBACK_TEMPLATES[name]['zh'];
  }
  console.error(`[Email] No template found for "${name}" locale "${locale}"`);
  return null;
}

export async function notifyNewTicket(env: Env, ticketId: string, title: string, description: string, priority: string, creatorEmail: string) {
  console.log(`[Email] notifyNewTicket called for ticket ${ticketId}, creator: ${creatorEmail}`);
  const admins = await env.DB.prepare("SELECT email FROM users WHERE role = 'admin'").all();
  console.log(`[Email] Notifying ${admins.results.length} admins about new ticket`);
  for (const admin of admins.results) {
    const adminEmail = admin.email as string;
    const adminLocale = await getUserLocale(env.DB, adminEmail);
    const tpl = await getTemplate(env.DB, "new_ticket", adminLocale);
    if (!tpl) { console.error(`[Email] No template for new_ticket locale ${adminLocale}`); continue; }
    const subject = renderTemplate(tpl.subject, { title, ticket_id: ticketId });
    const html = renderTemplate(tpl.body, { title, ticket_id: ticketId, description, priority });
    const result = await sendEmail(env, { to: adminEmail, subject, html });
    console.log(`[Email] Admin ${adminEmail} (${adminLocale}) result:`, JSON.stringify(result));
  }
}

export async function notifyTicketReply(env: Env, ticketId: string, title: string, content: string, recipientEmail: string, locale?: string) {
  const resolvedLocale = locale || await getUserLocale(env.DB, recipientEmail);
  console.log(`[Email] notifyTicketReply for ticket ${ticketId}, recipient: ${recipientEmail}, locale: ${resolvedLocale}`);
  const tpl = await getTemplate(env.DB, "ticket_reply", resolvedLocale);
  if (!tpl) { console.error("[Email] No template found for ticket_reply"); return { ok: false, error: "No template" }; }

  const subject = renderTemplate(tpl.subject, { title, ticket_id: ticketId });
  const html = renderTemplate(tpl.body, { title, ticket_id: ticketId, content });

  const result = await sendEmail(env, { to: recipientEmail, subject, html });
  console.log(`[Email] notifyTicketReply result for ${recipientEmail}:`, JSON.stringify(result));
  return result;
}

export async function notifyTicketClosed(env: Env, ticketId: string, title: string, recipientEmail: string, locale?: string) {
  const resolvedLocale = locale || await getUserLocale(env.DB, recipientEmail);
  console.log(`[Email] notifyTicketClosed for ticket ${ticketId}, recipient: ${recipientEmail}, locale: ${resolvedLocale}`);
  const tpl = await getTemplate(env.DB, "ticket_closed", resolvedLocale);
  if (!tpl) { console.error("[Email] No template found for ticket_closed"); return { ok: false, error: "No template" }; }

  const subject = renderTemplate(tpl.subject, { title, ticket_id: ticketId });
  const html = renderTemplate(tpl.body, { title, ticket_id: ticketId });

  const result = await sendEmail(env, { to: recipientEmail, subject, html });
  console.log(`[Email] notifyTicketClosed result for ${recipientEmail}:`, JSON.stringify(result));
  return result;
}
