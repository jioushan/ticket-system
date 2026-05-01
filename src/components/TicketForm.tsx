import { useState, useEffect } from "react";
import { Input, InputArea, Select, Button } from "@cloudflare/kumo";
import { api } from "../lib/api";
import { useTranslation } from "../i18n/I18nContext";
import TurnstileWidget from "./TurnstileWidget";
import type { TicketPriority } from "../types";

interface TicketFormProps {
  onSubmit: (data: { title: string; description: string; priority: TicketPriority; turnstileToken?: string }) => void;
  onCancel: () => void;
}

export default function TicketForm({ onSubmit, onCancel }: TicketFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  useEffect(() => {
    api.publicSettings().then((data: any) => {
      setTurnstileEnabled(data.turnstile_enabled);
      setTurnstileSiteKey(data.turnstile_site_key);
    }).catch(() => {});
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title, description, priority, turnstileToken: turnstileToken || undefined });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Input
        label={t("form.title")}
        placeholder={t("form.titlePlaceholder")}
        value={title}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        required
      />

      <InputArea
        label={t("form.description")}
        placeholder={t("form.descriptionPlaceholder")}
        value={description}
        onValueChange={setDescription}
        rows={4}
      />

      <Select
        label={t("ticket.priority")}
        value={priority}
        onValueChange={(v) => { if (v) setPriority(v as TicketPriority); }}
        items={{
          low: t("priority.low"),
          medium: t("priority.medium"),
          high: t("priority.high"),
          urgent: t("priority.urgent"),
        }}
      />

      {turnstileEnabled && (
        turnstileSiteKey ? (
          <TurnstileWidget
            siteKey={turnstileSiteKey}
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken("")}
          />
        ) : (
          <div style={{ fontSize: 13, color: "#ef4444", padding: "4px 0" }}>
            {t("auth.turnstileNotConfigured")}
          </div>
        )
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
        <Button variant="secondary" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary">{t("ticket.createTitle")}</Button>
      </div>
    </form>
  );
}
