import type { Env } from "./db";
import { getCurrentUser, jsonResponse } from "./db";

// GET /api/settings
export async function handleGetSettings(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const settings = await env.DB.prepare("SELECT key, value FROM settings").all();
  const result: Record<string, string> = {};
  for (const row of settings.results) {
    result[row.key as string] = row.value as string;
  }
  return jsonResponse(result);
}

// PUT /api/settings
export async function handleUpdateSettings(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403);

  const body = await request.json() as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, value).run();
  }
  return jsonResponse({ message: "Settings updated" });
}

// GET /api/users
export async function handleListUsers(env: Env, request: Request): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403);

  const users = await env.DB.prepare("SELECT id, username, email, role, status, created_at, last_login_at, last_login_ip FROM users ORDER BY created_at DESC").all();
  return jsonResponse(users.results);
}

// PUT /api/users/:id
export async function handleUpdateUser(env: Env, request: Request, userId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403;

  const { role, status } = await request.json() as { role?: string; status?: string };
  if (role) await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, userId).run();
  if (status) await env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(status, userId).run();

  return jsonResponse({ message: "User updated" });
}

// DELETE /api/users/:id
export async function handleDeleteUser(env: Env, request: Request, userId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403;

  // 删除用户的所有工单和相关数据
  await env.DB.prepare("DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE ticket_id IN (SELECT id FROM tickets WHERE user_id = ?))").bind(userId).run();
  await env.DB.prepare("DELETE FROM messages WHERE ticket_id IN (SELECT id FROM tickets WHERE user_id = ?)").bind(userId).run();
  await env.DB.prepare("DELETE FROM tickets WHERE user_id = ?").bind(userId).run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  await env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(userId).run();
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();

  return jsonResponse({ message: "User deleted" });
}
