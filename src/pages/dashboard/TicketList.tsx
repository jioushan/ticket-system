import { useState, useMemo, useEffect, useCallback } from "react";
import { Table, Badge, Tabs, Pagination, Empty, Text, Dialog } from "@cloudflare/kumo";
import { useTranslation } from "../../i18n/I18nContext";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import type { Ticket, TicketStatus, TicketPriority } from "../../types";
import TicketForm from "../../components/TicketForm";
import TicketConversation from "../../components/TicketConversation";

const statusVariant: Record<TicketStatus, "orange" | "blue" | "green" | "neutral"> = {
  open: "orange", in_progress: "blue", resolved: "green", closed: "neutral",
};
const priorityVariant: Record<string, "neutral" | "blue" | "orange" | "red"> = {
  low: "neutral", medium: "blue", high: "orange", urgent: "red",
};

interface TicketListProps {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}

export default function TicketList({ createOpen, onCreateOpenChange }: TicketListProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabFilter, setTabFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const fetchTickets = useCallback(async () => {
    try {
      const data = await api.tickets.list();
      setTickets(data);
    } catch (err) {
      console.error("Failed to fetch tickets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const filtered = useMemo(() => {
    let list = tickets;
    if (user?.role !== "admin") {
      list = list.filter((tk) => tk.user_id === user?.id);
    }
    if (tabFilter !== "all") list = list.filter((tk) => tk.status === tabFilter);
    return list;
  }, [tickets, tabFilter, user]);

  const paged = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page, perPage]);

  const statusLabel = (s: TicketStatus) => t(`ticket.${s === "in_progress" ? "inProgress" : s}`);

  const handleCreate = async (data: { title: string; description: string; priority: TicketPriority; turnstileToken?: string }) => {
    try {
      await api.tickets.create({ title: data.title, description: data.description, priority: data.priority, turnstileToken: data.turnstileToken });
      onCreateOpenChange(false);
      await fetchTickets();
    } catch (err: any) {
      alert(err.message || "Failed to create ticket");
    }
  };

  const handleCloseTicket = async (id: string) => {
    try {
      await api.tickets.close(id);
      setSelectedTicket(null);
      await fetchTickets();
    } catch (err: any) {
      alert(err.message || "Failed to close ticket");
    }
  };

  const handleDeleteTicket = async (id: string) => {
    try {
      await api.tickets.delete(id);
      setSelectedTicket(null);
      await fetchTickets();
    } catch (err: any) {
      alert(err.message || "Failed to delete ticket");
    }
  };

  const handleUpdateStatus = async (id: string, status: TicketStatus) => {
    try {
      await api.tickets.update(id, { status });
      await fetchTickets();
    } catch (err: any) {
      alert(err.message || "Failed to update status");
    }
  };

  const handleUpdatePriority = async (id: string, priority: TicketPriority) => {
    try {
      await api.tickets.update(id, { priority });
      await fetchTickets();
    } catch (err: any) {
      alert(err.message || "Failed to update priority");
    }
  };

  if (selectedTicket) {
    return (
      <TicketConversation
        ticket={selectedTicket}
        currentUserId={user?.id ?? ""}
        currentUserRole={user?.role ?? "user"}
        onBack={() => setSelectedTicket(null)}
        onCloseTicket={handleCloseTicket}
        onDeleteTicket={handleDeleteTicket}
        onUpdateStatus={handleUpdateStatus}
        onUpdatePriority={handleUpdatePriority}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem" }}><Text>{t("common.loading") || "Loading..."}</Text></div>
      ) : paged.length === 0 ? (
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
                  <Table.Cell><Text size="sm">{tk.updated_at}</Text></Table.Cell>
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

      <Dialog.Root open={createOpen} onOpenChange={onCreateOpenChange}>
        <Dialog size={isMobile ? "sm" : "lg"} className="p-8" style={{ maxHeight: "90vh", overflow: "auto" }}>
          <Dialog.Title>{t("ticket.new")}</Dialog.Title>
          <div style={{ paddingTop: 16 }}>
            <TicketForm onSubmit={handleCreate} onCancel={() => onCreateOpenChange(false)} />
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
