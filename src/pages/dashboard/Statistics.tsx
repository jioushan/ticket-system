import { useState, useEffect } from "react";
import { Text, Button, Tabs } from "@cloudflare/kumo";
import { Export } from "@phosphor-icons/react";
import { useTranslation } from "../../i18n/I18nContext";
import { api } from "../../lib/api";

interface Stats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  users: number;
  admins: number;
}

const cardStyle: React.CSSProperties = {
  padding: "1.5rem",
  borderRadius: 12,
  border: "1px solid var(--color-kumo-hairline)",
  background: "var(--color-kumo-base)",
};

function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "1.5rem", height: 200, padding: "0 1rem" }}>
      {data.map((d) => (
        <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Text size="sm" bold>{d.value}</Text>
          <div style={{
            width: "100%", maxWidth: 80,
            height: `${(d.value / max) * 160}px`,
            background: d.color, borderRadius: "6px 6px 0 0",
            transition: "height 0.3s",
          }} />
          <Text size="xs">{d.label}</Text>
        </div>
      ))}
    </div>
  );
}

function PieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ textAlign: "center", padding: "2rem" }}><Text>No data</Text></div>;
  let cumulative = 0;
  const gradient = data.map((d) => {
    const start = (cumulative / total) * 360;
    cumulative += d.value;
    const end = (cumulative / total) * 360;
    return `${d.color} ${start}deg ${end}deg`;
  }).join(", ");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2rem", justifyContent: "center", flexWrap: "wrap" }}>
      <div style={{
        width: 180, height: 180, borderRadius: "50%",
        background: `conic-gradient(${gradient})`,
      }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((d) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <Text size="sm">{d.label}: {d.value} ({Math.round(d.value / total * 100)}%)</Text>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Statistics() {
  const { t } = useTranslation();
  const [chartType, setChartType] = useState("bar");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stats()
      .then((data) => setStats(data))
      .catch((err) => console.error("Failed to fetch stats:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    try {
      const tickets = await api.tickets.list();
      const csv = "ID,Title,Status,Priority,Created\n" +
        tickets.map((tk: any) => `${tk.id},${tk.title},${tk.status},${tk.priority},${tk.created_at}`).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "tickets.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "Export failed");
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: "2rem" }}><Text>{t("common.loading") || "Loading..."}</Text></div>;
  }

  if (!stats) {
    return <div style={{ textAlign: "center", padding: "2rem" }}><Text>{t("stats.loadFailed")}</Text></div>;
  }

  const chartData = [
    { label: t("stats.pending"), value: stats.open, color: "#f59e0b" },
    { label: t("stats.inProgressLabel"), value: stats.inProgress, color: "#3b82f6" },
    { label: t("stats.completed"), value: stats.resolved, color: "#22c55e" },
    { label: t("stats.closedLabel"), value: stats.closed, color: "#6b7280" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="secondary" icon={<Export />} onClick={handleExport}>{t("stats.export")}</Button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
        {[
          { label: t("stats.total"), value: stats.total },
          { label: t("stats.open"), value: stats.open },
          { label: t("stats.inProgress"), value: stats.inProgress },
          { label: t("stats.resolved"), value: stats.resolved },
        ].map((item) => (
          <div key={item.label} style={cardStyle}>
            <Text size="sm" variant="secondary">{item.label}</Text>
            <Text variant="heading1" as="span">{item.value}</Text>
          </div>
        ))}
      </div>

      {/* Chart toggle */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <Text variant="heading3" as="h3">{t("chart.statusDistribution")}</Text>
          <Tabs
            value={chartType}
            onValueChange={setChartType}
            variant="segmented"
            tabs={[
              { value: "bar", label: t("chart.bar") },
              { value: "pie", label: t("chart.pie") },
            ]}
          />
        </div>
        {chartType === "bar" ? <BarChart data={chartData} /> : <PieChart data={chartData} />}
      </div>

      {/* User stats */}
      <div style={cardStyle}>
        <Text variant="heading3" as="h3">{t("stats.userStats")}</Text>
        <div style={{ display: "flex", gap: "3rem", marginTop: "1rem" }}>
          <div>
            <Text size="sm" variant="secondary">{t("stats.users")}</Text>
            <Text variant="heading2" as="span">{stats.users}</Text>
          </div>
          <div>
            <Text size="sm" variant="secondary">{t("stats.admins")}</Text>
            <Text variant="heading2" as="span">{stats.admins}</Text>
          </div>
        </div>
      </div>
    </div>
  );
}
