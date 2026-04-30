import { Button } from "@cloudflare/kumo";
import { Sun, Moon, SignOut } from "@phosphor-icons/react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "../i18n/I18nContext";
import LanguageSwitch from "./LanguageSwitch";

const LOGO_URL = "https://www.jsmsr.com/v3/assets/img/favicon.svg";

export default function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { t } = useTranslation();

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.5rem",
      padding: "0.5rem 1rem",
      borderBottom: "1px solid var(--color-kumo-hairline)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <img src={LOGO_URL} alt="Logo" style={{ width: 28, height: 28 }} />
        <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-color-kumo-strong, var(--text-color-kumo-default))" }}>
          {t("app.title")}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <LanguageSwitch />
      <Button
        variant="ghost"
        size="sm"
        shape="square"
        aria-label={theme === "light" ? t("theme.dark") : t("theme.light")}
        onClick={toggleTheme}
      >
        {theme === "light" ? <Moon /> : <Sun />}
      </Button>
      <Button variant="ghost" size="sm" shape="square" aria-label={t("auth.login")} onClick={logout}>
        <SignOut />
      </Button>
      </div>
    </div>
  );
}
