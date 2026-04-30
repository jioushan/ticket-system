-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  last_login_ip TEXT
);

-- 工单表
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 附件表
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 系统设置表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 邮件模板表
CREATE TABLE IF NOT EXISTS email_templates (
  name TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL
);

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 密码重置表
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 默认管理员账号 (密码: admin, 使用 SHA-256 哈希)
-- 密码哈希在应用代码中动态生成，这里只做表结构

-- 默认设置
INSERT OR IGNORE INTO settings (key, value) VALUES ('turnstile_enabled', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('turnstile_site_key', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('turnstile_secret_key', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('registration_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('allowed_formats', 'zip,jpg,png');
INSERT OR IGNORE INTO settings (key, value) VALUES ('max_file_size', '5242880');

-- 默认邮件模板
INSERT OR IGNORE INTO email_templates (name, subject, body) VALUES (
  'new_ticket',
  '[工单系统] 新工单: {title}',
  '<h2>新工单已创建</h2><p>工单编号: {ticket_id}</p><p>标题: {title}</p><p>描述: {description}</p><p>优先级: {priority}</p>'
);
INSERT OR IGNORE INTO email_templates (name, subject, body) VALUES (
  'ticket_reply',
  '[工单系统] 工单回复: {title}',
  '<h2>工单有新回复</h2><p>工单编号: {ticket_id}</p><p>标题: {title}</p><p>回复内容: {content}</p>'
);
INSERT OR IGNORE INTO email_templates (name, subject, body) VALUES (
  'ticket_closed',
  '[工单系统] 工单已关闭: {title}',
  '<h2>工单已关闭</h2><p>工单编号: {ticket_id}</p><p>标题: {title}</p>'
);
