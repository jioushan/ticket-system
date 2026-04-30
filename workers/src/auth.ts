import type { Env } from "./db";
import { hashPassword, verifyPassword, generateId, generateToken, getCurrentUser, jsonResponse } from "./db";

// POST /api/auth/login
export async function handleLogin(env: Env, request: Request): Promise<Response> {
  const { username, password } = await request.json() as { username: string; password: string };
  if (!username || !password) return jsonResponse({ error: "Missing credentials" }, 400);

  const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? OR email = ?").bind(username, username).first();
  if (!user) return jsonResponse({ error: "Invalid credentials" }, 401);

  if (user.status === "disabled") return jsonResponse({ error: "Account disabled" }, 403);

  const valid = await verifyPassword(password, user.password_hash as string);
  if (!valid) return jsonResponse({ error: "Invalid credentials" }, 401);

  // 创建 session
  const token = generateToken();
  const sessionId = generateId("s");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(sessionId, user.id, token, expiresAt).run();

  // 更新最后登录时间
  await env.DB.prepare(
    "UPDATE users SET last_login_at = datetime('now'), last_login_ip = ? WHERE id = ?"
  ).bind(ip, user.id).run();

  return jsonResponse({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
  });
}

// POST /api/auth/register
export async function handleRegister(env: Env, request: Request): Promise<Response> {
  // 检查注册是否开启
  const regSetting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'registration_enabled'").first();
  if (regSetting && regSetting.value === "false") {
    return jsonResponse({ error: "Registration is disabled" }, 403);
  }

  const { username, email, password } = await request.json() as { username: string; email: string; password: string };
  if (!username || !email || !password) return jsonResponse({ error: "Missing fields" }, 400);

  // 检查用户名/邮箱是否已存在
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

  const user = await env.DB.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first();
  if (!user) {
    // 不泄露用户是否存在
    return jsonResponse({ message: "If the email exists, a reset link has been sent" });
  }

  const resetToken = generateToken();
  const resetId = generateId("r");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1小时有效

  await env.DB.prepare(
    "INSERT INTO password_resets (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(resetId, user.id, resetToken, expiresAt).run();

  // TODO: 发送邮件 (SendGrid)
  // await sendEmail(env, user.email, "重置密码", `点击链接重置: https://your-domain/reset-password?token=${resetToken}`);

  return jsonResponse({ message: "If the email exists, a reset link has been sent", _dev_token: resetToken });
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

  // 清除所有 session
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(reset.user_id).run();

  return jsonResponse({ message: "Password reset successful" });
}

// GET /api/auth/me
export async function handleMe(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  return jsonResponse({ id: user.id, username: user.username, email: user.email, role: user.role });
}
