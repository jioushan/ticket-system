-- Migration: Add locale support for email templates
-- Run: wrangler d1 execute ticket-system --remote --file=./migrations/001_add_locale.sql

-- Step 1: Add locale column to users (skip if exists)
ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'zh-TW';

-- Step 2: Recreate email_templates with composite PK (SQLite limitation)
-- Only run if email_templates still has old schema (name TEXT PRIMARY KEY)
CREATE TABLE IF NOT EXISTS email_templates_new (
  name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'zh-TW',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (name, locale)
);

INSERT INTO email_templates_new (name, locale, subject, body)
  SELECT name, 'zh-TW', subject, body FROM email_templates;

DROP TABLE email_templates;
ALTER TABLE email_templates_new RENAME TO email_templates;

-- Step 3: Insert en templates
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

-- Step 4: Insert ja templates
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
