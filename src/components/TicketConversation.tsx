import { useState, useRef, useEffect, useCallback } from "react";
import { Button, Text, Badge, InputArea, Dialog, Select } from "@cloudflare/kumo";
import { PaperPlaneRight, Smiley, ArrowLeft, Trash, CheckCircle, Paperclip } from "@phosphor-icons/react";
import { useTranslation } from "../i18n/I18nContext";
import { api } from "../lib/api";
import type { Ticket, TicketStatus, TicketPriority, TicketMessage } from "../types";

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
        content: input.trim() || "[附件]",
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

  const handleInputChange = (val: string) => {
    setInput(val);
    // Signal typing (debounced - at most once per 2 seconds)
    const now = Date.now();
    if (now - lastTypingSignalRef.current > 2000) {
      lastTypingSignalRef.current = now;
      api.tickets.signalTyping(ticket.id).catch(() => {});
    }
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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap",
        padding: "1rem", borderBottom: "1px solid var(--color-kumo-hairline)",
      }}>
        <Button variant="ghost" size="sm" shape="square" aria-label="Back" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text bold>{ticket.id} — {ticket.title}</Text>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
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
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
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
      <div style={{ flex: 1, overflow: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem" }}><Text>{t("common.loading") || "Loading..."}</Text></div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", opacity: 0.5 }}><Text>暫無消息</Text></div>
        ) : (
          messages.map((msg) => {
            const isAdmin = msg.role === "admin";
            return (
              <div key={msg.id} style={{
                display: "flex",
                justifyContent: isAdmin ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth: "70%",
                  padding: "0.75rem 1rem",
                  borderRadius: 12,
                  borderTopLeftRadius: isAdmin ? 12 : 2,
                  borderTopRightRadius: isAdmin ? 2 : 12,
                  background: isAdmin
                    ? "var(--color-kumo-brand)"
                    : "var(--color-kumo-fill)",
                  color: isAdmin ? "#fff" : "inherit",
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, opacity: 0.8 }}>
                    <Text size="sm">{msg.username}</Text>
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    <Text size="sm">{msg.content}</Text>
                  </div>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {msg.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={api.attachments.downloadUrl(att.r2_key, localStorage.getItem("auth_token") || "")}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 12,
                            color: isAdmin ? "#bfdbfe" : "#3b82f6",
                            textDecoration: "underline",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Paperclip size={12} /> {att.filename} ({formatFileSize(att.size)})
                        </a>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6, textAlign: "right" }}>
                    {msg.created_at}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {currentStatus !== "closed" && (
        <div style={{
          padding: "0.75rem 1rem",
          borderTop: "1px solid var(--color-kumo-hairline)",
          display: "flex", flexDirection: "column", gap: "0.5rem",
        }}>
          {showEmoji && (
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 4, padding: 8,
              borderRadius: 8, background: "var(--color-kumo-fill)",
            }}>
              {EMOJI_LIST.map((e) => (
                <button key={e} onClick={() => setInput(input + e)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 4 }}>
                  {e}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
            <Button variant="ghost" size="sm" shape="square" aria-label="Emoji"
              onClick={() => setShowEmoji(!showEmoji)}>
              <Smiley />
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="sm"
              shape="square"
              aria-label={t("common.attachFile")}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip />
            </Button>
            <div style={{ flex: 1 }}>
              <InputArea
                placeholder={t("ticket.reply") + "..."}
                value={input}
                onValueChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={2}
              />
            </div>
            <Button variant="primary" size="sm" shape="square" aria-label="Send" onClick={handleSend} disabled={sending}>
              <PaperPlaneRight />
            </Button>
          </div>
          {pendingFile && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--color-kumo-fill)" }}>
              <Paperclip size={12} />
              <span>{pendingFile.name} ({formatFileSize(pendingFile.size)})</span>
              <button onClick={() => setPendingFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontWeight: 700, fontSize: 14, padding: "0 4px" }}>×</button>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.6 }}>
            {typingUser ? <span>{typingUser} 正在輸入...</span> : <span />}
          </div>
        </div>
      )}

      {currentStatus === "closed" && (
        <div style={{ padding: "1rem", textAlign: "center", borderTop: "1px solid var(--color-kumo-hairline)" }}>
          <Text size="sm" variant="secondary">此工單已關閉</Text>
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
