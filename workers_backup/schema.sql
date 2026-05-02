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
  last_login_ip TEXT,
  locale TEXT NOT NULL DEFAULT 'zh-TW'
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
  name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'zh-TW',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (name, locale)
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

-- 登录日志表
CREATE TABLE IF NOT EXISTS login_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  ip TEXT,
  user_agent TEXT,
  logged_in_at TEXT NOT NULL DEFAULT (datetime('now'))
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
INSERT OR IGNORE INTO settings (key, value) VALUES ('email_config', '');

-- 2FA 表
CREATE TABLE IF NOT EXISTS user_2fa (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  secret TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 输入状态表
CREATE TABLE IF NOT EXISTS typing_status (
  ticket_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ticket_id, user_id)
);

-- Passkey (WebAuthn) 凭证表
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 默认邮件模板 (en)
INSERT OR IGNORE INTO email_templates (name, locale, subject, body) VALUES (
  'new_ticket', 'en',
  '[Ticket System] New Ticket: {title}',
  '<h2>New Ticket Created</h2><p>Ticket ID: {ticket_id}</p><p>Title: {title}</p><p>Description: {description}</p><p>Priority: {priority}</p>'
);
INSERT OR IGNORE INTO email_templates (name, locale, subject, body) VALUES (
  'ticket_reply', 'en',
  '[Ticket System] Ticket Reply: {title}',
  '<h2>New Reply on Ticket</h2><p>Ticket ID: {ticket_id}</p><p>Title: {title}</p><p>Reply: {content}</p>'
);
INSERT OR IGNORE INTO email_templates (name, locale, subject, body) VALUES (
  'ticket_closed', 'en',
  '[Ticket System] Ticket Closed: {title}',
  '<h2>Ticket Closed</h2><p>Ticket ID: {ticket_id}</p><p>Title: {title}</p>'
);
-- 默认邮件模板 (zh-TW)
INSERT OR IGNORE INTO email_templates (name, locale, subject, body) VALUES (
  'new_ticket', 'zh-TW',
  '[Ticket JSMSR Network] 新工單: {title}',
  '<h2>新工單已建立</h2><p>工單編號: {ticket_id}</p><p>標題: {title}</p><p>描述: {description}</p><p>優先級: {priority}</p>'
);
INSERT OR IGNORE INTO email_templates (name, locale, subject, body) VALUES (
  'ticket_reply', 'zh-TW',
  '[Ticket JSMSR Network] 工單回覆: {title}',
  '<h2>工單有新回覆</h2><p>工單編號: {ticket_id}</p><p>標題: {title}</p><p>回覆內容: {content}</p>'
);
INSERT OR IGNORE INTO email_templates (name, locale, subject, body) VALUES (
  'ticket_closed', 'zh-TW',
  '[Ticket JSMSR Network] 工單已關閉: {title}',
  '<h2>工單已關閉</h2><p>工單編號: {ticket_id}</p><p>標題: {title}</p>'
);
-- 默认邮件模板 (ja)
INSERT OR IGNORE INTO email_templates (name, locale, subject, body) VALUES (
  'new_ticket', 'ja',
  '[チケットシステム] 新規チケット: {title}',
  '<h2>新規チケットが作成されました</h2><p>チケットID: {ticket_id}</p><p>件名: {title}</p><p>説明: {description}</p><p>優先度: {priority}</p>'
);
INSERT OR IGNORE INTO email_templates (name, locale, subject, body) VALUES (
  'ticket_reply', 'ja',
  '[チケットシステム] チケット返信: {title}',
  '<h2>チケットに新しい返信があります</h2><p>チケットID: {ticket_id}</p><p>件名: {title}</p><p>返信内容: {content}</p>'
);
INSERT OR IGNORE INTO email_templates (name, locale, subject, body) VALUES (
  'ticket_closed', 'ja',
  '[チケットシステム] チケット終了: {title}',
  '<h2>チケットが終了しました</h2><p>チケットID: {ticket_id}</p><p>件名: {title}</p>'
);
