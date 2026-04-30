import { useState } from "react";
import { Text, Button, Tabs } from "@cloudflare/kumo";
import { Export } from "@phosphor-icons/react";
import { useTranslation } from "../../i18n/I18nContext";

const mockStats = {
  total: 128, open: 23, inProgress: 15, resolved: 67, closed: 23,
  users: 45, admins: 3,
};

const barData = [
  { label: "待處理", value: 23, color: "#f59e0b" },
  { label: "進行中", value: 15, color: "#3b82f6" },
  { label: "已完成", value: 67, color: "#22c55e" },
  { label: "已關閉", value: 23, color: "#6b7280" },
];

const pieData = [
  { label: "待處理", value: 23, color: "#f59e0b" },
  { label: "進行中", value: 15, color: "#3b82f6" },
  { label: "已完成", value: 67, color: "#22c55e" },
  { label: "已關閉", value: 23, color: "#6b7280" },
];

const cardStyle: React.CSSProperties = {
  padding: "1.5rem",
  borderRadius: 12,
  border: "1px solid var(--color-kumo-hairline)",
  background: "var(--color-kumo-base)",
};

function BarChart() {
  const max = Math.max(...barData.map(d => d.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "1.5rem", height: 200, padding: "0 1rem" }}>
      {barData.map((d) => (
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

function PieChart() {
  const total = pieData.reduce((s, d) => s + d.value, 0);
  let cumulative = 0;
  const gradient = pieData.map((d) => {
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
        {pieData.map((d) => (
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

  const handleExport = () => {
    const csv = "ID,Title,Status,Priority,Created\nT-001,Server down,open,urgent,2026-04-28\nT-002,SSL expiring,in_progress,high,2026-04-25";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tickets.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="secondary" icon={<Export />} onClick={handleExport}>{t("stats.export")}</Button>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
        {[
          { label: t("stats.total"), value: mockStats.total },
          { label: t("stats.open"), value: mockStats.open },
          { label: t("stats.inProgress"), value: mockStats.inProgress },
          { label: t("stats.resolved"), value: mockStats.resolved },
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
          <Text variant="heading3" as="h3">工單狀態分佈</Text>
          <Tabs
            value={chartType}
            onValueChange={setChartType}
            variant="segmented"
            tabs={[
              { value: "bar", label: "柱狀圖" },
              { value: "pie", label: "餅圖" },
            ]}
          />
        </div>
        {chartType === "bar" ? <BarChart /> : <PieChart />}
      </div>

      {/* User stats */}
      <div style={cardStyle}>
        <Text variant="heading3" as="h3">用戶統計</Text>
        <div style={{ display: "flex", gap: "3rem", marginTop: "1rem" }}>
          <div>
            <Text size="sm" variant="secondary">用戶</Text>
            <Text variant="heading2" as="span">{mockStats.users}</Text>
          </div>
          <div>
            <Text size="sm" variant="secondary">管理員</Text>
            <Text variant="heading2" as="span">{mockStats.admins}</Text>
          </div>
        </div>
      </div>
    </div>
  );
}
