import { Text } from "@cloudflare/kumo";
import { useTranslation } from "../i18n/I18nContext";
import { VERSION } from "../lib/version";

export default function Footer() {
  const { t } = useTranslation();

  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      padding: "1rem",
      borderTop: "1px solid var(--color-kumo-hairline)",
    }}>
      <Text size="sm" variant="secondary">
        {t("app.footer")} {VERSION}
      </Text>
    </div>
  );
}
