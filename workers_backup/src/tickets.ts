import type { Env } from "./db";
import { generateId, getCurrentUser, jsonResponse } from "./db";
import { verifyTurnstile } from "./turnstile";
import { notifyNewTicket, notifyTicketReply, notifyTicketClosed } from "./email";

// GET /api/tickets
export async function handleListTickets(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  let tickets;
  if (user.role === "admin") {
    tickets = await env.DB.prepare("SELECT t.*, u.username as creator_name FROM tickets t JOIN users u ON t.user_id = u.id ORDER BY t.updated_at DESC").all();
  } else {
    tickets = await env.DB.prepare("SELECT t.*, u.username as creator_name FROM tickets t JOIN users u ON t.user_id = u.id WHERE t.user_id = ? ORDER BY t.updated_at DESC").bind(user.id).all();
  }
  return jsonResponse(tickets.results);
}

// POST /api/tickets
export async function handleCreateTicket(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const { title, description, priority, turnstileToken } = await request.json() as { title: string; description: string; priority: string; turnstileToken?: string };
  if (!title || !description) return jsonResponse({ error: "Missing fields" }, 400);

  // Turnstile verification
  const turnstileEnabled = await env.DB.prepare("SELECT value FROM settings WHERE key = 'turnstile_enabled'").first();
  if (turnstileEnabled && turnstileEnabled.value === "true") {
    if (!turnstileToken) return jsonResponse({ error: "Turnstile token required" }, 400);
    const valid = await verifyTurnstile(env, turnstileToken);
    if (!valid) return jsonResponse({ error: "Turnstile verification failed" }, 403);
  }

  const id = generateId("T");
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO tickets (id, user_id, title, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, user.id, title, "open", priority || "medium", now, now).run();

  // 创建第一条消息
  const msgId = generateId("M");
  await env.DB.prepare(
    "INSERT INTO messages (id, ticket_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(msgId, id, user.id, description, now).run();

  // 发送邮件通知管理员
  try {
    await notifyNewTicket(env, id, title, description, priority || "medium", user.email);
  } catch (err: any) {
    console.error("[Ticket] Failed to send new ticket email:", err);
  }

  return jsonResponse({ id, title, status: "open", priority: priority || "medium" }, 201);
}

// GET /api/tickets/:id
export async function handleGetTicket(env: Env, request: Request, ticketId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const ticket = await env.DB.prepare(
    "SELECT t.*, u.username as creator_name FROM tickets t JOIN users u ON t.user_id = u.id WHERE t.id = ?"
  ).bind(ticketId).first();

  if (!ticket) return jsonResponse({ error: "Not found" }, 404);
  if (user.role !== "admin" && ticket.user_id !== user.id) return jsonResponse({ error: "Forbidden" }, 403);

  const messages = await env.DB.prepare(
    "SELECT m.*, u.username, u.role FROM messages m JOIN users u ON m.user_id = u.id WHERE m.ticket_id = ? ORDER BY m.created_at ASC"
  ).bind(ticketId).all();

  // Fetch attachments for each message
  const messagesWithAttachments = [];
  for (const msg of messages.results) {
    const attachments = await env.DB.prepare(
      "SELECT id, filename, r2_key, size, type FROM attachments WHERE message_id = ?"
    ).bind(msg.id).all();
    messagesWithAttachments.push({ ...msg, attachments: attachments.results });
  }

  return jsonResponse({ ...ticket, messages: messagesWithAttachments });
}

// POST /api/tickets/:id/messages  (multipart/form-data: content + optional file)
export async function handleAddMessage(env: Env, request: Request, ticketId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const ticket = await env.DB.prepare("SELECT * FROM tickets WHERE id = ?").bind(ticketId).first();
  if (!ticket) return jsonResponse({ error: "Not found" }, 404);
  if (user.role !== "admin" && ticket.user_id !== user.id) return jsonResponse({ error: "Forbidden" }, 403);
  if (ticket.status === "closed") return jsonResponse({ error: "Ticket is closed" }, 400);

  const contentType = request.headers.get("Content-Type") || "";
  let content = "";
  let file: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    content = (formData.get("content") as string) || "";
    file = formData.get("file") as File | null;
  } else {
    const body = await request.json() as { content: string };
    content = body.content;
  }

  if (!content && !file) return jsonResponse({ error: "Missing content" }, 400);

  const msgId = generateId("M");
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO messages (id, ticket_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(msgId, ticketId, user.id, content || "[附件]", now).run();

  // 处理附件
  let attachment: any = null;
  if (file && file.size > 0) {
    const maxSizeSetting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'max_file_size'").first();
    const maxSize = maxSizeSetting ? parseInt(maxSizeSetting.value as string) : 5 * 1024 * 1024;
    if (file.size > maxSize) return jsonResponse({ error: "File too large" }, 400);

    const formatsSetting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'allowed_formats'").first();
    const allowedFormats = formatsSetting ? (formatsSetting.value as string).split(",").map(f => f.trim().toLowerCase()) : ["zip", "jpg", "png"];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedFormats.includes(ext)) return jsonResponse({ error: "File format not allowed" }, 400);

    const r2Key = `attachments/${ticketId}/${generateId("f")}-${file.name}`;
    await env.ATTACHMENTS.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    const attId = generateId("a");
    await env.DB.prepare("INSERT INTO attachments (id, message_id, filename, r2_key, size, type) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(attId, msgId, file.name, r2Key, file.size, file.type).run();

    attachment = { id: attId, filename: file.name, r2_key: r2Key, size: file.size, type: file.type };
  }

  await env.DB.prepare("UPDATE tickets SET updated_at = ? WHERE id = ?").bind(now, ticketId).run();

  // 发送邮件通知
  const emailDebug: any[] = [];
  const ticketInfo = await env.DB.prepare("SELECT t.title, t.user_id, u.email, u.locale FROM tickets t JOIN users u ON t.user_id = u.id WHERE t.id = ?").bind(ticketId).first();
  if (ticketInfo) {
    const recipientId = user.id === ticketInfo.user_id ? null : ticketInfo.user_id;
    if (recipientId) {
      try {
        const emailResult = await notifyTicketReply(env, ticketId, ticketInfo.title as string, content || "[附件]", ticketInfo.email as string, ticketInfo.locale as string);
        emailDebug.push({ to: ticketInfo.email, result: emailResult });
      } catch (err: any) {
        emailDebug.push({ to: ticketInfo.email, error: err.message });
      }
    } else {
      const admins = await env.DB.prepare("SELECT email, locale FROM users WHERE role = 'admin' AND id != ?").bind(user.id).all();
      for (const admin of admins.results) {
        try {
          const emailResult = await notifyTicketReply(env, ticketId, ticketInfo.title as string, content || "[附件]", admin.email as string, admin.locale as string);
          emailDebug.push({ to: admin.email, result: emailResult });
        } catch (err: any) {
          emailDebug.push({ to: admin.email, error: err.message });
        }
      }
    }
  } else {
    emailDebug.push({ error: "ticketInfo is null" });
  }

  return jsonResponse({ id: msgId, content: content || "[附件]", created_at: now, attachment, _emailDebug: emailDebug }, 201);
}

// PUT /api/tickets/:id
export async function handleUpdateTicket(env: Env, request: Request, ticketId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403);

  const { status, priority } = await request.json() as { status?: string; priority?: string };
  const now = new Date().toISOString();

  if (status) await env.DB.prepare("UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?").bind(status, now, ticketId).run();
  if (priority) await env.DB.prepare("UPDATE tickets SET priority = ?, updated_at = ? WHERE id = ?").bind(priority, now, ticketId).run();

  return jsonResponse({ message: "Ticket updated" });
}

// PUT /api/tickets/:id/close
export async function handleCloseTicket(env: Env, request: Request, ticketId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403);

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE tickets SET status = 'closed', updated_at = ? WHERE id = ?").bind(now, ticketId).run();

  // 发送邮件通知
  const ticket = await env.DB.prepare("SELECT t.title, t.user_id, u.email, u.locale FROM tickets t JOIN users u ON t.user_id = u.id WHERE t.id = ?").bind(ticketId).first();
  if (ticket) {
    try {
      await notifyTicketClosed(env, ticketId, ticket.title as string, ticket.email as string, ticket.locale as string);
    } catch (err: any) {
      console.error("[Ticket] Failed to send close email:", err);
    }
  }

  return jsonResponse({ message: "Ticket closed" });
}

// DELETE /api/tickets/:id
export async function handleDeleteTicket(env: Env, request: Request, ticketId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403);

  await env.DB.prepare("DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE ticket_id = ?)").bind(ticketId).run();
  await env.DB.prepare("DELETE FROM messages WHERE ticket_id = ?").bind(ticketId).run();
  await env.DB.prepare("DELETE FROM tickets WHERE id = ?").bind(ticketId).run();

  return jsonResponse({ message: "Ticket deleted" });
}

// POST /api/tickets/:id/upload
export async function handleUpload(env: Env, request: Request, ticketId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const ticket = await env.DB.prepare("SELECT * FROM tickets WHERE id = ?").bind(ticketId).first();
  if (!ticket) return jsonResponse({ error: "Not found" }, 404);
  if (user.role !== "admin" && ticket.user_id !== user.id) return jsonResponse({ error: "Forbidden" }, 403);

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return jsonResponse({ error: "No file" }, 400);

  // Check file size (default 5MB)
  const maxSizeSetting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'max_file_size'").first();
  const maxSize = maxSizeSetting ? parseInt(maxSizeSetting.value as string) : 5 * 1024 * 1024;
  if (file.size > maxSize) return jsonResponse({ error: "File too large" }, 400);

  // Check file format
  const formatsSetting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'allowed_formats'").first();
  const allowedFormats = formatsSetting ? (formatsSetting.value as string).split(",").map(f => f.trim().toLowerCase()) : ["zip", "jpg", "png"];
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!allowedFormats.includes(ext)) return jsonResponse({ error: "File format not allowed" }, 400);

  const r2Key = `attachments/${ticketId}/${generateId("f")}-${file.name}`;
  await env.ATTACHMENTS.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Find or create a message to attach to
  const lastMsg = await env.DB.prepare("SELECT id FROM messages WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1").bind(ticketId).first();
  const msgId = lastMsg ? lastMsg.id as string : generateId("M");

  if (!lastMsg) {
    await env.DB.prepare("INSERT INTO messages (id, ticket_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(msgId, ticketId, user.id, "[附件]", new Date().toISOString()).run();
  }

  const attId = generateId("a");
  await env.DB.prepare("INSERT INTO attachments (id, message_id, filename, r2_key, size, type) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(attId, msgId, file.name, r2Key, file.size, file.type).run();

  return jsonResponse({ id: attId, filename: file.name, r2_key: r2Key, size: file.size, type: file.type }, 201);
}

// GET /api/attachments/:key
export async function handleDownloadAttachment(env: Env, request: Request, rawKey: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  // R2 key 可能包含 /，URL 中被編碼為 %2F，需要解碼
  const key = decodeURIComponent(rawKey);
  const object = await env.ATTACHMENTS.get(key);
  if (!object) return jsonResponse({ error: "Not found" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `attachment; filename="${key.split("/").pop()}"`);
  return new Response(object.body, { headers });
}

// POST /api/tickets/:id/typing
export async function handleTypingSignal(env: Env, request: Request, ticketId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  await env.DB.prepare("INSERT OR REPLACE INTO typing_status (ticket_id, user_id, updated_at) VALUES (?, ?, datetime('now'))")
    .bind(ticketId, user.id).run();

  return jsonResponse({ ok: true });
}

// GET /api/tickets/:id/typing
export async function handleTypingCheck(env: Env, request: Request, ticketId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  // Check if anyone else is typing (within last 5 seconds)
  const typing = await env.DB.prepare(
    "SELECT u.username, u.role FROM typing_status ts JOIN users u ON ts.user_id = u.id WHERE ts.ticket_id = ? AND ts.user_id != ? AND ts.updated_at > datetime('now', '-5 seconds')"
  ).bind(ticketId, user.id).first();

  return jsonResponse({ typing: typing ? { username: typing.username, role: typing.role } : null });
}

// GET /api/stats
export async function handleStats(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403);

  const total = await env.DB.prepare("SELECT COUNT(*) as count FROM tickets").first();
  const open = await env.DB.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'").first();
  const inProgress = await env.DB.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'in_progress'").first();
  const resolved = await env.DB.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'resolved'").first();
  const closed = await env.DB.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'closed'").first();
  const users = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'user'").first();
  const admins = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").first();

  return jsonResponse({
    total: total?.count ?? 0, open: open?.count ?? 0, inProgress: inProgress?.count ?? 0,
    resolved: resolved?.count ?? 0, closed: closed?.count ?? 0,
    users: users?.count ?? 0, admins: admins?.count ?? 0,
  });
}
