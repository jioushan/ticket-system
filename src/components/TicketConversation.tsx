import { useState, useRef, useEffect, useCallback } from "react";
import { Button, Text, Badge, Dialog, Select } from "@cloudflare/kumo";
import { PaperPlaneRight, Smiley, ArrowLeft, Trash, CheckCircle, Paperclip } from "@phosphor-icons/react";
import { useTranslation } from "../i18n/I18nContext";
import { api } from "../lib/api";
import type { Ticket, TicketStatus, TicketPriority, TicketMessage } from "../types";

// Simple Markdown renderer for chat messages
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code (`...`)
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Bold (**...**)
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic (*...*)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

  // Line breaks
  html = html.replace(/\n/g, "<br/>");

  return html;
}

interface TicketConversationProps {
  ticket: Ticket;
  currentUserId: string;
  currentUserRole: "admin" | "user";
  onBack: () => void;
  onCloseTicket: (id: string) => void;
  onDeleteTicket: (id: string) => void;
  onUpdateStatus?: (id: string, status: TicketStatus) => void;
  onUpdatePriority?: (id: string, priority: TicketPriority) => void;
}

const statusVariant: Record<TicketStatus, "orange" | "blue" | "green" | "neutral"> = {
  open: "orange", in_progress: "blue", resolved: "green", closed: "neutral",
};

const priorityVariant: Record<string, "neutral" | "blue" | "orange" | "red"> = {
  low: "neutral", medium: "blue", high: "orange", urgent: "red",
};

const EMOJI_LIST = ["😀","😂","😍","🤔","👍","👎","❤️","🔥","✅","❌","⚠️","🎉","😢","😡","🙏","💪"];

function formatTime(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isToday) return time;
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
  } catch {
    return dateStr;
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

export default function TicketConversation({
  ticket, currentUserId, currentUserRole, onBack, onCloseTicket, onDeleteTicket, onUpdateStatus, onUpdatePriority,
}: TicketConversationProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<TicketStatus>(ticket.status);
  const [currentPriority, setCurrentPriority] = useState<TicketPriority>(ticket.priority);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSignalRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.tickets.get(ticket.id);
      setMessages(data.messages || []);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setLoading(false);
    }
  }, [ticket.id]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Real-time polling for new messages (every 4 seconds)
  useEffect(() => {
    if (currentStatus === "closed") return;
    const interval = setInterval(async () => {
      if (document.hidden) return;
      try {
        const data = await api.tickets.get(ticket.id);
        const newMessages = data.messages || [];
        if (newMessages.length > messages.length) {
          setMessages(newMessages);
        }
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [ticket.id, currentStatus, messages.length]);

  // Poll typing status
  useEffect(() => {
    if (currentStatus === "closed") return;
    const interval = setInterval(async () => {
      try {
        const data = await api.tickets.checkTyping(ticket.id);
        setTypingUser(data.typing?.username || null);
      } catch {}
    }, 2500);
    return () => clearInterval(interval);
  }, [ticket.id, currentStatus]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if ((!input.trim() && !pendingFile) || sending) return;
    setSending(true);
    try {
      const res = await api.tickets.addMessageWithFile(ticket.id, input.trim(), pendingFile || undefined);
      const newMsg: TicketMessage = {
        id: res.id,
        ticket_id: ticket.id,
        user_id: currentUserId,
        username: currentUserRole === "admin" ? "Admin" : "User",
        role: currentUserRole,
        content: input.trim() || t("common.attachment"),
        created_at: res.created_at,
        attachments: res.attachment ? [res.attachment] : [],
      };
      setMessages([...messages, newMsg]);
      setInput("");
      setPendingFile(null);
      setShowEmoji(false);
    } catch (err: any) {
      alert(err.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    autoResize(e.target);
    const now = Date.now();
    if (now - lastTypingSignalRef.current > 2000) {
      lastTypingSignalRef.current = now;
      api.tickets.signalTyping(ticket.id).catch(() => {});
    }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStatusChange = (val: string | null) => {
    if (!val) return;
    const newStatus = val as TicketStatus;
    setCurrentStatus(newStatus);
    onUpdateStatus?.(ticket.id, newStatus);
  };

  const handlePriorityChange = (val: string | null) => {
    if (!val) return;
    const newPriority = val as TicketPriority;
    setCurrentPriority(newPriority);
    onUpdatePriority?.(ticket.id, newPriority);
  };

  const getInitial = (name: string) => (name || "?").charAt(0).toUpperCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.75rem",
        padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-kumo-hairline)",
        flexShrink: 0,
      }}>
        <Button variant="ghost" size="sm" shape="square" aria-label="Back" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <Text bold>{ticket.title}</Text>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: 2, flexWrap: "wrap", alignItems: "center" }}>
            <Text size="xs" variant="secondary">{ticket.id}</Text>
            {currentUserRole === "admin" ? (
              <>
                <Select
                  aria-label={t("ticket.status")}
                  size="sm"
                  value={currentStatus}
                  onValueChange={handleStatusChange}
                  items={{
                    open: t("ticket.open"),
                    in_progress: t("ticket.inProgress"),
                    resolved: t("ticket.resolved"),
                    closed: t("ticket.closed"),
                  }}
                />
                <Select
                  aria-label={t("ticket.priority")}
                  size="sm"
                  value={currentPriority}
                  onValueChange={handlePriorityChange}
                  items={{
                    low: t("priority.low"),
                    medium: t("priority.medium"),
                    high: t("priority.high"),
                    urgent: t("priority.urgent"),
                  }}
                />
              </>
            ) : (
              <>
                <Badge variant={statusVariant[currentStatus]}>
                  {t(`ticket.${currentStatus === "in_progress" ? "inProgress" : currentStatus}`)}
                </Badge>
                <Badge variant={priorityVariant[currentPriority]}>
                  {t(`priority.${currentPriority}`)}
                </Badge>
              </>
            )}
          </div>
        </div>
        {currentUserRole === "admin" && (
          <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
            {currentStatus !== "closed" && (
              <Button variant="secondary" size="sm" icon={<CheckCircle />} onClick={() => { setCurrentStatus("closed"); onCloseTicket(ticket.id); }}>
                {t("ticket.close")}
              </Button>
            )}
            <Button variant="destructive" size="sm" icon={<Trash />} onClick={() => setDeleteOpen(true)}>
              {t("ticket.delete")}
            </Button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="chat-messages" style={{ flex: 1, overflow: "auto", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem" }}><Text>{t("common.loading") || "Loading..."}</Text></div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", opacity: 0.5 }}><Text>{t("ticket.noMessages")}</Text></div>
        ) : (
          messages.map((msg, idx) => {
            const isMine = msg.user_id === currentUserId;
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const showAvatar = !prevMsg || prevMsg.user_id !== msg.user_id;
            const showName = showAvatar;

            return (
              <div key={msg.id}>
                {/* Date separator if first message or different day */}
                {idx === 0 && (
                  <div style={{ textAlign: "center", margin: "0.5rem 0" }}>
                    <span style={{ fontSize: 11, color: "var(--text-color-kumo-subtle, #9ca3af)", background: "var(--color-kumo-base, #fff)", padding: "2px 10px", borderRadius: 10 }}>
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                )}

                <div style={{
                  display: "flex",
                  justifyContent: isMine ? "flex-end" : "flex-start",
                  alignItems: "flex-end",
                  gap: 6,
                  marginTop: showAvatar ? "0.5rem" : 2,
                  maxWidth: "100%",
                }}>
                  {/* Avatar (other's messages, left side) */}
                  {!isMine && (
                    <div style={{ width: 32, flexShrink: 0 }}>
                      {showAvatar && (
                        <div className={`chat-avatar ${msg.role === "admin" ? "chat-avatar-admin" : "chat-avatar-user"}`}>
                          {getInitial(msg.username)}
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`chat-bubble-wrap ${isMine ? "chat-bubble-wrap-end" : ""}`}>
                    {showName && !isMine && (
                      <div style={{ marginBottom: 2, marginLeft: 4, opacity: 0.7 }}>
                        <Text size="xs" bold>{msg.username}</Text>
                      </div>
                    )}
                    <div className={`chat-bubble ${isMine ? "chat-bubble-mine" : "chat-bubble-other"}`}>
                      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {msg.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={api.attachments.downloadUrl(att.r2_key, localStorage.getItem("auth_token") || "")}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`chat-attachment ${isMine ? "chat-attachment-mine" : "chat-attachment-other"}`}
                            >
                              <Paperclip size={12} /> {att.filename} ({formatFileSize(att.size)})
                            </a>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: 10, marginTop: 3, opacity: 0.55, textAlign: "right", whiteSpace: "nowrap" }}>
                        {formatTime(msg.created_at)}
                      </div>
                    </div>
                  </div>

                  {/* Avatar (my messages, right side) */}
                  {isMine && (
                    <div style={{ width: 32, flexShrink: 0 }}>
                      {showAvatar && (
                        <div className="chat-avatar chat-avatar-admin">
                          {getInitial(msg.username)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      {typingUser && currentStatus !== "closed" && (
        <div style={{ padding: "2px 1rem", flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "var(--text-color-kumo-subtle, #9ca3af)", display: "flex", alignItems: "center", gap: 6 }}>
            <span className="typing-dots"><span /><span /><span /></span>
            {t("ticket.typing", { name: typingUser })}
          </span>
        </div>
      )}

      {/* Input area */}
      {currentStatus !== "closed" && (
        <div style={{
          padding: "0.5rem 0.75rem",
          borderTop: "1px solid var(--color-kumo-hairline)",
          flexShrink: 0,
        }}>
          {/* Emoji picker */}
          {showEmoji && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 2, padding: 6, marginBottom: 6,
              borderRadius: 8, background: "var(--color-kumo-fill)",
            }}>
              {EMOJI_LIST.map((e) => (
                <button key={e} onClick={() => { setInput(input + e); setTimeout(() => textareaRef.current?.focus(), 0); }}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 4, borderRadius: 4 }}>
                  {e}
                </button>
              ))}
            </div>
          )}

          {/* Pending file chip */}
          {pendingFile && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 10px",
              borderRadius: 16, background: "var(--color-kumo-fill)", marginBottom: 6, width: "fit-content",
            }}>
              <Paperclip size={12} />
              <span>{pendingFile.name} ({formatFileSize(pendingFile.size)})</span>
              <button onClick={() => setPendingFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontWeight: 700, fontSize: 14, padding: "0 2px" }}>×</button>
            </div>
          )}

          {/* Input row */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "var(--text-color-kumo-subtle, #9ca3af)", flexShrink: 0 }}
              aria-label="Emoji"
            >
              <Smiley size={22} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "var(--text-color-kumo-subtle, #9ca3af)", flexShrink: 0 }}
              aria-label={t("common.attachFile")}
            >
              <Paperclip size={22} />
            </button>
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder={t("ticket.reply") + "..."}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={sending || (!input.trim() && !pendingFile)}
              aria-label="Send"
            >
              <PaperPlaneRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Closed notice */}
      {currentStatus === "closed" && (
        <div style={{ padding: "0.75rem 1rem", textAlign: "center", borderTop: "1px solid var(--color-kumo-hairline)", flexShrink: 0 }}>
          <Text size="sm" variant="secondary">{t("ticket.closedNotice")}</Text>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog size="sm" className="p-8">
          <Dialog.Title>{t("ticket.delete")}</Dialog.Title>
          <Dialog.Description>{t("settings.deleteConfirm")}</Dialog.Description>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 16 }}>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => { onDeleteTicket(ticket.id); setDeleteOpen(false); }}>
              {t("common.confirm")}
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
