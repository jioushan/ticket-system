import type { Env } from "./db";
import { generateId, getCurrentUser, jsonResponse } from "./db";

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

  const { title, description, priority } = await request.json() as { title: string; description: string; priority: string };
  if (!title || !description) return jsonResponse({ error: "Missing fields" }, 400);

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

  // TODO: 发送邮件通知

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

  return jsonResponse({ ...ticket, messages: messages.results });
}

// POST /api/tickets/:id/messages
export async function handleAddMessage(env: Env, request: Request, ticketId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const ticket = await env.DB.prepare("SELECT * FROM tickets WHERE id = ?").bind(ticketId).first();
  if (!ticket) return jsonResponse({ error: "Not found" }, 404);
  if (user.role !== "admin" && ticket.user_id !== user.id) return jsonResponse({ error: "Forbidden" }, 403);
  if (ticket.status === "closed") return jsonResponse({ error: "Ticket is closed" }, 400);

  const { content } = await request.json() as { content: string };
  if (!content) return jsonResponse({ error: "Missing content" }, 400);

  const msgId = generateId("M");
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO messages (id, ticket_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(msgId, ticketId, user.id, content, now).run();

  await env.DB.prepare("UPDATE tickets SET updated_at = ? WHERE id = ?").bind(now, ticketId).run();

  // TODO: 发送邮件通知

  return jsonResponse({ id: msgId, content, created_at: now }, 201);
}

// PUT /api/tickets/:id/close
export async function handleCloseTicket(env: Env, request: Request, ticketId: string): Promise<Response> {
  const user = await getCurrentUser(env.DB, request);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403);

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE tickets SET status = 'closed', updated_at = ? WHERE id = ?").bind(now, ticketId).run();

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
