import type { Env } from "./db";
import { hashPassword, verifyPassword, generateId, generateToken, getCurrentUser, jsonResponse } from "./db";
import { verifyTurnstile } from "./turnstile";
import { sendEmail } from "./email";
import { generateSecret, generateOTPAuthURL, verifyTOTP } from "./totp";
import { generateAuthenticationOptions } from "@simplewebauthn/server";

const PASSKEY_RP_ID = "web.ticket.jsmsr.com";

// POST /api/auth/login
export async function handleLogin(env: Env, request: Request): Promise<Response> {
  const { username, password, turnstileToken } = await request.json() as { username: string; password: string; turnstileToken?: string };
  if (!username || !password) return jsonResponse({ error: "Missing credentials" }, 400);

  // Turnstile verification
  const turnstileEnabled = await env.DB.prepare("SELECT value FROM settings WHERE key = 'turnstile_enabled'").first();
  if (turnstileEnabled && turnstileEnabled.value === "true") {
    if (!turnstileToken) return jsonResponse({ error: "Turnstile token required" }, 400);
    const valid = await verifyTurnstile(env, turnstileToken);
    if (!valid) return jsonResponse({ error: "Turnstile verification failed" }, 403);
  }

  const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? OR email = ?").bind(username, username).first();
  if (!user) return jsonResponse({ error: "Invalid credentials" }, 401);

  if (user.status === "disabled") return jsonResponse({ error: "Account disabled" }, 403);

  const valid = await verifyPassword(password, user.password_hash as string);
  if (!valid) return jsonResponse({ error: "Invalid credentials" }, 401);

  // 检查 2FA（TOTP 或 Passkey，互斥）
  const twoFA = await env.DB.prepare("SELECT * FROM user_2fa WHERE user_id = ? AND enabled = 1").bind(user.id).first();
  const hasPasskey = await env.DB.prepare("SELECT COUNT(*) as cnt FROM webauthn_credentials WHERE user_id = ?").bind(user.id).first();

  if (twoFA || (hasPasskey && (hasPasskey.cnt as number) > 0)) {
    const tempToken = generateToken();
    const tempId = generateId("t");
    const tempExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await env.DB.prepare("INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)")
      .bind(tempId, user.id, "temp_" + tempToken, tempExpires).run();

    if (twoFA) {
      return jsonResponse({ requires2fa: true, tempToken, method: "totp" });
    }

    // Passkey 2FA: 返回 WebAuthn authentication options
    const creds = await env.DB.prepare(
      "SELECT credential_id FROM webauthn_credentials WHERE user_id = ?"
    ).bind(user.id).all();
    const passkeyOptions = await generateAuthenticationOptions({
      rpID: PASSKEY_RP_ID,
      allowCredentials: creds.results.map((c: any) => ({ id: c.credential_id as string, type: "public-key" as const })),
      userVerification: "preferred",
    });

    // 存储 passkey challenge
    const challengeSessionId = generateId("pc");
    await env.DB.prepare("INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)")
      .bind(challengeSessionId, user.id, "pch_" + passkeyOptions.challenge, tempExpires).run();

    return jsonResponse({ requires2fa: true, tempToken, method: "passkey", passkeyOptions, challengeToken: challengeSessionId });
  }

  // 创建 session
  const token = generateToken();
  const sessionId = generateId("s");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(sessionId, user.id, token, expiresAt).run();

  await env.DB.prepare(
    "UPDATE users SET last_login_at = datetime('now'), last_login_ip = ? WHERE id = ?"
  ).bind(ip, user.id).run();

  // Record login log
  const ua = request.headers.get("User-Agent") || "";
  const logId = generateId("ll");
  await env.DB.prepare(
    "INSERT INTO login_logs (id, user_id, ip, user_agent, logged_in_at) VALUES (?, ?, ?, ?, datetime('now'))"
  ).bind(logId, user.id, ip, ua).run();

  return jsonResponse({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
  });
}

// POST /api/auth/register
export async function handleRegister(env: Env, request: Request): Promise<Response> {
  const regSetting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'registration_enabled'").first();
  if (regSetting && regSetting.value === "false") {
    return jsonResponse({ error: "Registration is disabled" }, 403);
  }

  const { username, email, password, turnstileToken } = await request.json() as { username: string; email: string; password: string; turnstileToken?: string };
  if (!username || !email || !password) return jsonResponse({ error: "Missing fields" }, 400);

  const turnstileEnabled = await env.DB.prepare("SELECT value FROM settings WHERE key = 'turnstile_enabled'").first();
  if (turnstileEnabled && turnstileEnabled.value === "true") {
    if (!turnstileToken) return jsonResponse({ error: "Turnstile token required" }, 400);
    const valid = await verifyTurnstile(env, turnstileToken);
    if (!valid) return jsonResponse({ error: "Turnstile verification failed" }, 403);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ? OR email = ?").bind(username, email).first();
  if (existing) return jsonResponse({ error: "Username or email already exists" }, 409);

  const id = generateId("u");
  const passwordHash = await hashPassword(password);

  await env.DB.prepare(
    "INSERT INTO users (id, username, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, username, email, passwordHash, "user", "active").run();

  return jsonResponse({ message: "Registration successful" }, 201);
}

// POST /api/auth/logout
export async function handleLogout(env: Env, request: Request): Promise<Response> {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  return jsonResponse({ message: "Logged out" });
}

// POST /api/auth/forgot-password
export async function handleForgotPassword(env: Env, request: Request): Promise<Response> {
  const { email } = await request.json() as { email: string };
  if (!email) return jsonResponse({ error: "Missing email" }, 400);

  const user = await env.DB.prepare("SELECT id, email, username FROM users WHERE email = ?").bind(email).first();
  if (!user) {
    return jsonResponse({ message: "If the email exists, a reset link has been sent" });
  }

  const resetToken = generateToken();
  const resetId = generateId("r");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO password_resets (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(resetId, user.id, resetToken, expiresAt).run();

  // 发送重置密码邮件
  const resetUrl = `https://web.ticket.jsmsr.com/reset-password?token=${resetToken}`;
  await sendEmail(env, {
    to: user.email as string,
    subject: "[Ticket System] Reset Password",
    html: `<h2>Reset Password</h2><p>Hello ${user.username},</p><p>You have requested a password reset. Please click the link below to reset your password (valid for 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, please ignore this email.</p>`,
  });

  return jsonResponse({ message: "If the email exists, a reset link has been sent" });
}

// POST /api/auth/reset-password
export async function handleResetPassword(env: Env, request: Request): Promise<Response> {
  const { token, newPassword } = await request.json() as { token: string; newPassword: string };
  if (!token || !newPassword) return jsonResponse({ error: "Missing fields" }, 400);

  const reset = await env.DB.prepare(
    "SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime('now')"
  ).bind(token).first();

  if (!reset) return jsonResponse({ error: "Invalid or expired token" }, 400);

  const passwordHash = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, reset.user_id).run();
  await env.DB.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").bind(reset.id).run();

  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(reset.user_id).run();

  return jsonResponse({ message: "Password reset successful" });
}

// POST /api/auth/change-password
export async function handleChangePassword(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const { currentPassword, newPassword } = await request.json() as { currentPassword: string; newPassword: string };
  if (!currentPassword || !newPassword) return jsonResponse({ error: "Missing fields" }, 400);
  if (newPassword.length < 4) return jsonResponse({ error: "Password too short" }, 400);

  const valid = await verifyPassword(currentPassword, user.password_hash as string);
  if (!valid) return jsonResponse({ error: "Current password is incorrect" }, 400);

  const passwordHash = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passwordHash, user.id).run();

  // 清除其他 session（保留當前）
  const auth = request.headers.get("Authorization");
  const currentToken = auth?.slice(7);
  if (currentToken) {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").bind(user.id, currentToken).run();
  }

  // 发送通知邮件
  await sendEmail(env, {
    to: user.email as string,
    subject: "[Ticket System] Password Changed",
    html: `<h2>Password Changed</h2><p>Hello ${user.username},</p><p>Your password has been successfully changed. If this was not you, please contact an administrator immediately.</p>`,
  });

  return jsonResponse({ message: "Password changed successfully" });
}

// GET /api/auth/me
export async function handleMe(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  const twoFA = await env.DB.prepare("SELECT enabled FROM user_2fa WHERE user_id = ?").bind(user.id).first();
  const passkeyCount = await env.DB.prepare("SELECT COUNT(*) as cnt FROM webauthn_credentials WHERE user_id = ?").bind(user.id).first();
  return jsonResponse({ id: user.id, username: user.username, email: user.email, role: user.role, locale: user.locale || 'zh-TW', has2fa: !!twoFA?.enabled, hasPasskey: (passkeyCount?.cnt as number || 0) > 0 });
}

// POST /api/auth/2fa/verify
export async function handleVerify2FA(env: Env, request: Request): Promise<Response> {
  const { tempToken, code, passkeyResponse, challengeToken } = await request.json() as {
    tempToken: string; code?: string; passkeyResponse?: any; challengeToken?: string;
  };
  if (!tempToken) return jsonResponse({ error: "Missing tempToken" }, 400);

  const session = await env.DB.prepare(
    "SELECT s.user_id, u.username, u.email, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > datetime('now')"
  ).bind("temp_" + tempToken).first();

  if (!session) return jsonResponse({ error: "Invalid or expired token" }, 400);

  // TOTP 验证
  if (code) {
    const twoFA = await env.DB.prepare("SELECT secret FROM user_2fa WHERE user_id = ? AND enabled = 1").bind(session.user_id).first();
    if (!twoFA) return jsonResponse({ error: "2FA not enabled" }, 400);
    const valid = await verifyTOTP(twoFA.secret as string, code);
    if (!valid) return jsonResponse({ error: "Invalid code" }, 400);
  }
  // Passkey 验证
  else if (passkeyResponse && challengeToken) {
    const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");

    const challengeSession = await env.DB.prepare(
      "SELECT token FROM sessions WHERE id = ? AND expires_at > datetime('now')"
    ).bind(challengeToken).first();

    if (!challengeSession || !(challengeSession.token as string).startsWith("pch_")) {
      return jsonResponse({ error: "Challenge expired" }, 400);
    }
    const expectedChallenge = (challengeSession.token as string).slice(4);

    const cred = await env.DB.prepare(
      "SELECT credential_id, public_key, counter FROM webauthn_credentials WHERE credential_id = ? AND user_id = ?"
    ).bind(passkeyResponse.id, session.user_id).first();

    if (!cred) return jsonResponse({ error: "Credential not found" }, 400);

    const base64urlToUint8 = (str: string): Uint8Array => {
      str = str.replace(/-/g, "+").replace(/_/g, "/");
      while (str.length % 4) str += "=";
      return Uint8Array.from(atob(str), c => c.charCodeAt(0));
    };

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: passkeyResponse,
        expectedChallenge,
        expectedOrigin: "https://web.ticket.jsmsr.com",
        expectedRPID: PASSKEY_RP_ID,
        credential: {
          id: cred.credential_id as string,
          publicKey: base64urlToUint8(cred.public_key as string),
          counter: cred.counter as number,
        },
      });
    } catch (err: any) {
      return jsonResponse({ error: err.message || "Passkey verification failed" }, 400);
    }

    if (!verification.verified) return jsonResponse({ error: "Passkey not verified" }, 400);

    await env.DB.prepare("UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?")
      .bind(verification.authenticationInfo.newCounter, passkeyResponse.id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(challengeToken).run();
  } else {
    return jsonResponse({ error: "Missing verification data" }, 400);
  }

  // 删除临时 session
  await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind("temp_" + tempToken).run();

  // 创建正式 session
  const token = generateToken();
  const sessionId = generateId("s");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)")
    .bind(sessionId, session.user_id, token, expiresAt).run();

  // Record login log
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  const ua = request.headers.get("User-Agent") || "";
  const logId = generateId("ll");
  await env.DB.prepare(
    "INSERT INTO login_logs (id, user_id, ip, user_agent, logged_in_at) VALUES (?, ?, ?, ?, datetime('now'))"
  ).bind(logId, session.user_id, ip, ua).run();

  return jsonResponse({
    token,
    user: { id: session.user_id, username: session.username, email: session.email, role: session.role },
  });
}

// POST /api/auth/2fa/setup
export async function handle2FASetup(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const secret = generateSecret();
  const url = generateOTPAuthURL(secret, user.email as string);

  // 存储 secret（未启用）
  await env.DB.prepare("INSERT OR REPLACE INTO user_2fa (user_id, secret, enabled) VALUES (?, ?, 0)")
    .bind(user.id, secret).run();

  return jsonResponse({ secret, otpauth_url: url });
}

// POST /api/auth/2fa/enable
export async function handle2FAEnable(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const { code } = await request.json() as { code: string };
  if (!code) return jsonResponse({ error: "Missing code" }, 400);

  const twoFA = await env.DB.prepare("SELECT secret FROM user_2fa WHERE user_id = ?").bind(user.id).first();
  if (!twoFA) return jsonResponse({ error: "Please setup 2FA first" }, 400);

  const valid = await verifyTOTP(twoFA.secret as string, code);
  if (!valid) return jsonResponse({ error: "Invalid code" }, 400);

  await env.DB.prepare("UPDATE user_2fa SET enabled = 1 WHERE user_id = ?").bind(user.id).run();

  return jsonResponse({ message: "2FA enabled" });
}

// POST /api/auth/2fa/disable
export async function handle2FADisable(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const { code } = await request.json() as { code: string };
  if (!code) return jsonResponse({ error: "Missing code" }, 400);

  const twoFA = await env.DB.prepare("SELECT secret FROM user_2fa WHERE user_id = ? AND enabled = 1").bind(user.id).first();
  if (!twoFA) return jsonResponse({ error: "2FA not enabled" }, 400);

  const valid = await verifyTOTP(twoFA.secret as string, code);
  if (!valid) return jsonResponse({ error: "Invalid code" }, 400);

  await env.DB.prepare("DELETE FROM user_2fa WHERE user_id = ?").bind(user.id).run();

  return jsonResponse({ message: "2FA disabled" });
}
