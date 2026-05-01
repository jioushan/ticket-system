import { useState, useEffect } from "react";
import { Sidebar, Text, Button } from "@cloudflare/kumo";
import { ListChecks, ChartBar, GearSix, ArrowLeft } from "@phosphor-icons/react";
import { useTranslation } from "../i18n/I18nContext";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import Footer from "../components/Footer";
import TicketList from "./dashboard/TicketList";
import Statistics from "./dashboard/Statistics";
import Settings from "./dashboard/Settings";

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeNav, setActiveNav] = useState("tickets");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const navItems = [
    { key: "tickets", label: t("nav.tickets"), icon: <ListChecks /> },
    ...(user?.role === "admin" ? [{ key: "stats", label: t("nav.stats"), icon: <ChartBar /> }] : []),
    { key: "settings", label: t("nav.settings"), icon: <GearSix /> },
  ];

  return (
    <Sidebar.Provider open={sidebarOpen} onOpenChange={setSidebarOpen} collapsible="icon">
      <Sidebar>
        <Sidebar.Header>
          {sidebarOpen && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0 0.25rem" }}>
              <img src="https://www.jsmsr.com/v3/assets/img/favicon.svg" alt="Logo" style={{ width: 24, height: 24 }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>{t("app.title")}</span>
            </div>
          )}
        </Sidebar.Header>
        <Sidebar.Content>
          <Sidebar.Menu>
            {navItems.map((item) => (
              <Sidebar.MenuItem key={item.key}>
                <Sidebar.MenuButton
                  active={activeNav === item.key}
                  onClick={() => { setActiveNav(item.key); if (isMobile) setSidebarOpen(false); }}
                  icon={item.icon}
                  tooltip={item.label}
                >
                  {item.label}
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            ))}
          </Sidebar.Menu>
        </Sidebar.Content>
        {/* Bottom-left toggle */}
        <div style={{
          padding: "0.75rem",
          borderTop: "1px solid var(--color-kumo-hairline)",
          display: "flex",
          justifyContent: sidebarOpen ? "flex-end" : "center",
        }}>
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            aria-label="Toggle sidebar"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <ArrowLeft style={{ transform: sidebarOpen ? "none" : "rotate(180deg)", transition: "transform 0.2s" }} />
          </Button>
        </div>
      </Sidebar>

      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        height: "100vh",
        overflow: "hidden",
      }}>
        <TopBar />

        {/* Page header — no sidebar toggle here */}
        <div style={{
          display: "flex",
          alignItems: "center",
          padding: "0.75rem 1.5rem",
          borderBottom: "1px solid var(--color-kumo-hairline)",
          flexShrink: 0,
        }}>
          <Text variant="heading2" as="h1">
            {navItems.find(n => n.key === activeNav)?.label}
          </Text>
        </div>

        {/* Content area */}
        <div style={{
          flex: 1,
          overflow: "auto",
          padding: isMobile ? "1rem" : "1.5rem",
        }}>
          {activeNav === "tickets" && <TicketList />}
          {activeNav === "stats" && <Statistics />}
          {activeNav === "settings" && <Settings />}
        </div>

        <Footer />
      </div>
    </Sidebar.Provider>
  );
}
