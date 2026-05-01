import { useState } from "react";
import { Button, SensitiveInput, Banner } from "@cloudflare/kumo";
import { api } from "../lib/api";
import { useTranslation } from "../i18n/I18nContext";
const LOGO_URL = "https://www.jsmsr.com/v3/assets/img/favicon.svg";

export default function ResetPassword() {
  const { t } = useTranslation();
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const token = new URLSearchParams(window.location.search).get("token") || "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPw) return;
    if (newPw !== confirmPw) { setResult({ ok: false, msg: t("settings.passwordMismatch") }); return; }
    if (newPw.length < 4) { setResult({ ok: false, msg: t("settings.passwordTooShort") }); return; }
    setLoading(true);
    setResult(null);
    try {
      await api.auth.resetPassword(token, newPw);
      setResult({ ok: true, msg: t("auth.resetSuccess") });
      setTimeout(() => { window.location.href = "/"; }, 2000);
    } catch (err: any) {
      setResult({ ok: false, msg: err.message || t("auth.resetFailed") });
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={{
        display: "flex", width: "100%", minHeight: "100vh",
        alignItems: "center", justifyContent: "center",
        background: "var(--color-kumo-canvas)",
      }}>
        <div style={{
          width: "100%", maxWidth: 420, borderRadius: 16,
          background: "var(--color-kumo-base)", border: "1px solid var(--color-kumo-hairline)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)", padding: "2rem 1.75rem",
          textAlign: "center",
        }}>
          <Banner variant="error">{t("auth.invalidToken")}</Banner>
          <Button variant="secondary" size="lg" onClick={() => { window.location.href = "/"; }} style={{ marginTop: "1rem" }}>
            {t("auth.backToLogin")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", width: "100%", minHeight: "100vh",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "2rem 1rem", background: "var(--color-kumo-canvas)",
    }}>
      <div style={{
        width: "100%", maxWidth: 420, borderRadius: 16,
        background: "var(--color-kumo-base)", border: "1px solid var(--color-kumo-hairline)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)", padding: "2rem 1.75rem",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ textAlign: "center" }}>
            <img src={LOGO_URL} alt="Logo" style={{ width: 48, height: 48, marginBottom: 8 }} />
            <h1 style={{
              fontSize: "1.5rem", fontWeight: 700, margin: 0,
              color: "var(--text-color-kumo-strong, var(--text-color-kumo-default))",
            }}>{t("auth.resetPasswordTitle")}</h1>
          </div>
          {result && <Banner variant={result.ok ? "default" : "error"}>{result.msg}</Banner>}
          {!result?.ok && (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <SensitiveInput label={t("auth.newPassword")} value={newPw} onValueChange={setNewPw} />
              <SensitiveInput label={t("auth.confirmPassword")} value={confirmPw} onValueChange={setConfirmPw} />
              <Button type="submit" variant="primary" size="lg" loading={loading}>{t("auth.resetPassword")}</Button>
            </form>
          )}
          <Button variant="secondary" size="lg" onClick={() => { window.location.href = "/"; }}>
            {t("auth.backToLogin")}
          </Button>
        </div>
      </div>
    </div>
  );
}
