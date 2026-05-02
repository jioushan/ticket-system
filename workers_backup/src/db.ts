// D1 数据库操作封装

export interface Env {
  DB: D1Database;
  ATTACHMENTS: R2Bucket;
  SENDGRID_API_KEY: string;
  SENDGRID_SENDER: string;
  TURNSTILE_SECRET_KEY: string;
  JWT_SECRET: string;
}

// 密码哈希 (SHA-256, Workers 兼容)
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const h = await hashPassword(password);
  return h === hash;
}

// 生成随机 ID
export function generateId(prefix: string = ""): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return prefix ? `${prefix}-${random}` : random;
}

// 生成 session token
export function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

// 初始化默认管理员
export async function initAdmin(db: D1Database) {
  const existing = await db.prepare("SELECT id FROM users WHERE username = ?").bind("admin").first();
  if (!existing) {
    const passwordHash = await hashPassword("admin");
    await db.prepare(
      "INSERT INTO users (id, username, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(generateId("u"), "admin", "admin@jsmsr.com", passwordHash, "admin", "active").run();
  }
}

// 从 Authorization header 或 query param 获取当前用户
export async function getCurrentUser(db: D1Database, request: Request): Promise<any | null> {
  let token: string | null = null;
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    token = auth.slice(7);
  } else {
    const url = new URL(request.url);
    token = url.searchParams.get("token");
  }
  if (!token) return null;
  const session = await db.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > datetime('now')"
  ).bind(token).first();
  return session || null;
}

// CORS 头
export function corsHeaders(origin: string = "*"): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// JSON 响应
export function jsonResponse(data: any, status: number = 200, origin: string = "*"): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}
