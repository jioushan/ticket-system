import { Button } from "@cloudflare/kumo";
import { Sun, Moon, SignOut } from "@phosphor-icons/react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "../i18n/I18nContext";
import LanguageSwitch from "./LanguageSwitch";

export default function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { t } = useTranslation();

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "0.5rem",
      padding: "0.5rem 1rem",
      borderBottom: "1px solid var(--color-kumo-hairline)",
    }}>
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
  );
}
