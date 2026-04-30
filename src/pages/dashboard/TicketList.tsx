import { useState, useMemo } from "react";
import { Table, Badge, Button, Tabs, Pagination, Empty, Text, Dialog } from "@cloudflare/kumo";
import { Plus } from "@phosphor-icons/react";
import { useTranslation } from "../../i18n/I18nContext";
import { useAuth } from "../../context/AuthContext";
import type { Ticket, TicketStatus, TicketPriority } from "../../types";
import TicketForm from "../../components/TicketForm";
import TicketConversation from "../../components/TicketConversation";

const statusVariant: Record<TicketStatus, "orange" | "blue" | "green" | "neutral"> = {
  open: "orange", in_progress: "blue", resolved: "green", closed: "neutral",
};
const priorityVariant: Record<string, "neutral" | "blue" | "orange" | "red"> = {
  low: "neutral", medium: "blue", high: "orange", urgent: "red",
};

const mockTickets: Ticket[] = [
  { id: "T-001", title: "伺服器無法連線", description: "US Kansas City 節點回報無法連線，影響範圍約 30% 用戶", status: "open", priority: "urgent", assignee: "user1", createdAt: "2026-04-28 09:00", updatedAt: "2026-04-28 14:30" },
  { id: "T-002", title: "SSL 憑證即將過期", description: "api.example.com 的 SSL 憑證將於 5 月 15 日過期", status: "in_progress", priority: "high", assignee: "user1", createdAt: "2026-04-25 10:00", updatedAt: "2026-04-27 16:00" },
  { id: "T-003", title: "資料庫效能優化", description: "查詢回應時間超過 2 秒，需要進行索引優化", status: "in_progress", priority: "medium", assignee: "user2", createdAt: "2026-04-20 08:00", updatedAt: "2026-04-26 11:00" },
  { id: "T-004", title: "備份排程異常", description: "每日凌晨備份任務偶發失敗", status: "resolved", priority: "high", assignee: "user1", createdAt: "2026-04-15 07:00", updatedAt: "2026-04-22 09:00" },
  { id: "T-005", title: "新增 CDN 快取規則", description: "為 /assets/* 路徑設定 30 天快取", status: "closed", priority: "low", assignee: "user2", createdAt: "2026-04-10 14:00", updatedAt: "2026-04-12 10:00" },
];

export default function TicketList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>(mockTickets);
  const [tabFilter, setTabFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const filtered = useMemo(() => {
    let list = tickets;
    // 用户只看到自己的工单
    if (user?.role !== "admin") {
      list = list.filter((tk) => tk.assignee === user?.id || tk.assignee === user?.username);
    }
    if (tabFilter !== "all") list = list.filter((tk) => tk.status === tabFilter);
    return list;
  }, [tickets, tabFilter, user]);

  const paged = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page, perPage]);

  const statusLabel = (s: TicketStatus) => t(`ticket.${s === "in_progress" ? "inProgress" : s}`);

  const handleCreate = (data: { title: string; description: string; priority: TicketPriority; assignee: string }) => {
    const now = new Date().toISOString().slice(0, 16).replace("T", " ");
    const newTicket: Ticket = {
      id: `T-${String(tickets.length + 1).padStart(3, "0")}`,
      ...data,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    setTickets([newTicket, ...tickets]);
    setCreateOpen(false);
    // TODO: API call + email notification
  };

  const handleCloseTicket = (id: string) => {
    const now = new Date().toISOString().slice(0, 16).replace("T", " ");
    setTickets(tickets.map((tk) => tk.id === id ? { ...tk, status: "closed", updatedAt: now } : tk));
    setSelectedTicket(null);
  };

  const handleDeleteTicket = (id: string) => {
    setTickets(tickets.filter((tk) => tk.id !== id));
    setSelectedTicket(null);
  };

  // 如果选中了工单，显示对话视图
  if (selectedTicket) {
    return (
      <TicketConversation
        ticket={selectedTicket}
        currentUserId={user?.id ?? ""}
        currentUserRole={user?.role ?? "user"}
        onBack={() => setSelectedTicket(null)}
        onCloseTicket={handleCloseTicket}
        onDeleteTicket={handleDeleteTicket}
        onUpdateStatus={(id, status) => {
          const now = new Date().toISOString().slice(0, 16).replace("T", " ");
          setTickets(tickets.map(tk => tk.id === id ? { ...tk, status, updatedAt: now } : tk));
        }}
        onUpdatePriority={(id, priority) => {
          const now = new Date().toISOString().slice(0, 16).replace("T", " ");
          setTickets(tickets.map(tk => tk.id === id ? { ...tk, priority, updatedAt: now } : tk));
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="primary" icon={<Plus />} onClick={() => setCreateOpen(true)}>
          {t("ticket.new")}
        </Button>
      </div>

      <Tabs
        value={tabFilter}
        onValueChange={(v) => { setTabFilter(v); setPage(1); }}
        variant="underline"
        tabs={[
          { value: "all", label: t("ticket.all") },
          { value: "open", label: t("ticket.open") },
          { value: "in_progress", label: t("ticket.inProgress") },
          { value: "resolved", label: t("ticket.resolved") },
          { value: "closed", label: t("ticket.closed") },
        ]}
      />

      {paged.length === 0 ? (
        <Empty title={t("common.noData")} />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <Table>
            <Table.Header sticky>
              <Table.Row>
                <Table.Head>ID</Table.Head>
                <Table.Head>{t("ticket.title")}</Table.Head>
                <Table.Head>{t("ticket.status")}</Table.Head>
                <Table.Head>{t("ticket.priority")}</Table.Head>
                <Table.Head>{t("ticket.updatedAt")}</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {paged.map((tk) => (
                <Table.Row key={tk.id} onClick={() => setSelectedTicket(tk)} style={{ cursor: "pointer" }}>
                  <Table.Cell><Text size="sm">{tk.id}</Text></Table.Cell>
                  <Table.Cell><Text bold>{tk.title}</Text></Table.Cell>
                  <Table.Cell><Badge variant={statusVariant[tk.status]}>{statusLabel(tk.status)}</Badge></Table.Cell>
                  <Table.Cell><Badge variant={priorityVariant[tk.priority]}>{t(`priority.${tk.priority}`)}</Badge></Table.Cell>
                  <Table.Cell><Text size="sm">{tk.updatedAt}</Text></Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}

      {filtered.length > perPage && (
        <Pagination page={page} setPage={setPage} perPage={perPage} totalCount={filtered.length}>
          <Pagination.Info />
          <Pagination.Controls />
        </Pagination>
      )}

      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog size="lg" className="p-8">
          <Dialog.Title>{t("ticket.new")}</Dialog.Title>
          <div style={{ paddingTop: 16 }}>
            <TicketForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
