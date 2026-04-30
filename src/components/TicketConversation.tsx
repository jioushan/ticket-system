import { useState, useRef, useEffect } from "react";
import { Button, Text, Badge, InputArea, Dialog, Select } from "@cloudflare/kumo";
import { PaperPlaneRight, Paperclip, Smiley, ArrowLeft, Trash, CheckCircle } from "@phosphor-icons/react";
import { useTranslation } from "../i18n/I18nContext";
import type { Ticket, TicketStatus, TicketPriority } from "../types";

interface Message {
  id: string;
  userId: string;
  username: string;
  role: "admin" | "user";
  content: string;
  attachments?: { name: string; url: string; type: string }[];
  createdAt: string;
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

export default function TicketConversation({
  ticket, currentUserId, currentUserRole, onBack, onCloseTicket, onDeleteTicket, onUpdateStatus, onUpdatePriority,
}: TicketConversationProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([
    { id: "m1", userId: ticket.assignee === "admin" ? "admin-id" : "user-1", username: "User", role: "user", content: ticket.description, createdAt: ticket.createdAt },
    { id: "m2", userId: "admin-id", username: "Admin", role: "admin", content: "收到，我們正在處理中。", createdAt: ticket.updatedAt },
  ]);
  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<TicketStatus>(ticket.status);
  const [currentPriority, setCurrentPriority] = useState<TicketPriority>(ticket.priority);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const newMsg: Message = {
      id: "m" + Date.now(),
      userId: currentUserId,
      username: currentUserRole === "admin" ? "Admin" : "User",
      role: currentUserRole,
      content: input.trim(),
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    };
    setMessages([...messages, newMsg]);
    setInput("");
    setShowEmoji(false);
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
        {messages.map((msg) => {
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
                    {msg.attachments.map((att, i) => (
                      <a key={i} href={att.url} target="_blank" rel="noopener"
                        style={{ fontSize: 12, color: isAdmin ? "#bfdbfe" : "#3b82f6", textDecoration: "underline" }}>
                        📎 {att.name}
                      </a>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6, textAlign: "right" }}>
                  {msg.createdAt}
                </div>
              </div>
            </div>
          );
        })}
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
            <Button variant="ghost" size="sm" shape="square" aria-label="Attach"
              onClick={() => { /* TODO: file picker */ }}>
              <Paperclip />
            </Button>
            <div style={{ flex: 1 }}>
              <InputArea
                placeholder={t("ticket.reply") + "..."}
                value={input}
                onValueChange={setInput}
                onKeyDown={handleKeyDown}
                rows={2}
              />
            </div>
            <Button variant="primary" size="sm" shape="square" aria-label="Send" onClick={handleSend}>
              <PaperPlaneRight />
            </Button>
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
