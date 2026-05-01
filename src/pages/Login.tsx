import { useState, useEffect } from "react";
import { Button, Input, SensitiveInput, Banner } from "@cloudflare/kumo";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { useTranslation } from "../i18n/I18nContext";
import LanguageSwitch from "../components/LanguageSwitch";
import { useTheme } from "../context/ThemeContext";
import { Sun, Moon, ArrowLeft, Fingerprint } from "@phosphor-icons/react";
import { LOGIN_BG_URL } from "../config";
import TurnstileWidget from "../components/TurnstileWidget";
import { startAuthentication } from "@simplewebauthn/browser";

const LOGO_URL = "https://www.jsmsr.com/v3/assets/img/favicon.svg";

type Panel = "login" | "register" | "forgot";

export default function Login() {
  const { login, completeLogin } = useAuth();
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [panel, setPanel] = useState<Panel>("login");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // 2FA
  const [requires2fa, setRequires2fa] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [twoFACode, setTwoFACode] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  // Turnstile
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  useEffect(() => {
    api.publicSettings().then((data: any) => {
      setTurnstileEnabled(data.turnstile_enabled);
      setTurnstileSiteKey(data.turnstile_site_key);
    }).catch(() => {});
  }, []);

  const switchPanel = (target: Panel) => {
    setError("");
    setSuccess("");
    setTurnstileToken("");
    setPanel(target);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setError("");
    setLoading(true);
    try {
      const result = await login(username, password);
      if (result.requires2fa) {
        setRequires2fa(true);
        setTempToken(result.tempToken || "");
      }
    } catch { setError(t("auth.loginError")); }
    finally { setLoading(false); }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFACode) return;
    setError("");
    setLoading(true);
    try {
      const data = await api.auth.verify2fa(tempToken, twoFACode);
      completeLogin(data.token, data.user);
    } catch { setError("驗證碼錯誤"); }
    finally { setLoading(false); }
  };

  const handlePasskeyLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const { options, challengeToken } = await api.auth.passkeyLoginOptions(username || undefined);
      const response = await startAuthentication({ optionsJSON: options, useBrowserAutofill: false });
      const data = await api.auth.passkeyLoginVerify(response, challengeToken);
      completeLogin(data.token, data.user);
    } catch (err: any) {
      setError(err.message || "Passkey 驗證失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername || !regEmail || !regPassword) return;
    if (regPassword !== regConfirm) { setError("密碼不一致"); return; }
    if (turnstileEnabled && turnstileSiteKey && !turnstileToken) { setError("請完成驗證"); return; }
    if (turnstileEnabled && !turnstileSiteKey) { setError("Turnstile 網站密鑰未配置，無法註冊"); return; }
    setError("");
    setLoading(true);
    try {
      await api.auth.register(regUsername, regEmail, regPassword, turnstileToken || undefined);
      setSuccess(t("auth.registerSuccess"));
      setTimeout(() => switchPanel("login"), 1500);
    } catch (err: any) {
      setError(err.message || t("auth.loginError"));
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setError("");
    setLoading(true);
    try {
      await api.auth.forgotPassword(forgotEmail);
      setSuccess("重置連結已發送至您的電子郵件");
    } catch (err: any) {
      setError(err.message || t("auth.loginError"));
    } finally {
      setLoading(false);
    }
  };

  const visible = (target: Panel) => panel === target;

  const hasBg = !!LOGIN_BG_URL;

  return (
    <div style={{
      display: "flex",
      width: "100%",
      minHeight: "100vh",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem 1rem",
      ...(hasBg
        ? {
            backgroundImage: `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${LOGIN_BG_URL})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }
        : { background: "var(--color-kumo-canvas)" }),
    }}>
      {/* Top-right controls */}
      <div style={{ position: "fixed", top: 16, right: 20, display: "flex", gap: "0.5rem", alignItems: "center", zIndex: 10 }}>
        <LanguageSwitch />
        <Button variant="ghost" size="sm" shape="square" aria-label="Toggle theme" onClick={toggleTheme}>
          {theme === "light" ? <Moon /> : <Sun />}
        </Button>
      </div>

      {/* Card */}
      <div style={{
        width: "100%",
        maxWidth: 420,
        borderRadius: 16,
        background: "var(--color-kumo-base)",
        border: "1px solid var(--color-kumo-hairline)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        padding: "2rem 1.75rem",
      }}>

        {/* LOGIN */}
        {visible("login") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ textAlign: "center" }}>
              <img src={LOGO_URL} alt="Logo" style={{ width: 48, height: 48, marginBottom: 8 }} />
              <h1 style={{
                fontSize: "1.5rem", fontWeight: 700, margin: 0,
                color: "var(--text-color-kumo-strong, var(--text-color-kumo-default))",
              }}>{requires2fa ? "二次驗證" : t("app.title")}</h1>
            </div>
            {error && <Banner variant="error">{error}</Banner>}
            {!requires2fa ? (
              <>
                <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <Input label={t("auth.username")} value={username} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)} />
                  <SensitiveInput label={t("auth.password")} value={password} onValueChange={setPassword} />
                  <Button type="submit" variant="primary" size="lg" loading={loading}>{t("auth.login")}</Button>
                </form>
                <Button variant="secondary" size="lg" icon={<Fingerprint />} onClick={handlePasskeyLogin} loading={loading}>
                  使用 Passkey 登入
                </Button>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button type="button" className="text-link-btn" onClick={() => switchPanel("register")}>
                    {t("auth.register")}
                  </button>
                  <button type="button" className="text-link-btn" onClick={() => switchPanel("forgot")}>
                    {t("auth.forgotPassword")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <form onSubmit={handleVerify2FA} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <Input
                    label="驗證碼"
                    placeholder="輸入 6 位驗證碼"
                    value={twoFACode}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTwoFACode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                  />
                  <Button type="submit" variant="primary" size="lg" loading={loading}>驗證</Button>
                </form>
                <button type="button" className="text-link-btn" onClick={() => { setRequires2fa(false); setTempToken(""); setTwoFACode(""); setError(""); }}>
                  返回登入
                </button>
              </>
            )}
          </div>
        )}

        {/* REGISTER */}
        {visible("register") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ textAlign: "center" }}>
              <img src={LOGO_URL} alt="Logo" style={{ width: 48, height: 48, marginBottom: 8 }} />
              <h1 style={{
                fontSize: "1.5rem", fontWeight: 700, margin: 0,
                color: "var(--text-color-kumo-strong, var(--text-color-kumo-default))",
              }}>{t("auth.register")}</h1>
            </div>
            {error && <Banner variant="error">{error}</Banner>}
            {success && <Banner variant="default">{success}</Banner>}
            <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <Input label={t("auth.username")} value={regUsername} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegUsername(e.target.value)} />
              <Input label={t("auth.email")} type="email" value={regEmail} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegEmail(e.target.value)} />
              <SensitiveInput label={t("auth.password")} value={regPassword} onValueChange={setRegPassword} />
              <SensitiveInput label={t("auth.confirmPassword")} value={regConfirm} onValueChange={setRegConfirm} />
              {turnstileEnabled && (
                turnstileSiteKey ? (
                  <TurnstileWidget
                    siteKey={turnstileSiteKey}
                    onVerify={setTurnstileToken}
                    onExpire={() => setTurnstileToken("")}
                  />
                ) : (
                  <div style={{ fontSize: 13, color: "#ef4444", padding: "4px 0" }}>
                    Turnstile 驗證已啟用但網站密鑰未配置，請聯繫管理員
                  </div>
                )
              )}
              <Button type="submit" variant="primary" size="lg" loading={loading}>{t("auth.submit")}</Button>
            </form>
            <Button variant="secondary" size="lg" icon={<ArrowLeft />} onClick={() => switchPanel("login")}>
              {t("auth.backToLogin")}
            </Button>
          </div>
        )}

        {/* FORGOT */}
        {visible("forgot") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ textAlign: "center" }}>
              <img src={LOGO_URL} alt="Logo" style={{ width: 48, height: 48, marginBottom: 8 }} />
              <h1 style={{
                fontSize: "1.5rem", fontWeight: 700, margin: 0,
                color: "var(--text-color-kumo-strong, var(--text-color-kumo-default))",
              }}>{t("auth.forgotPassword")}</h1>
            </div>
            {error && <Banner variant="error">{error}</Banner>}
            {success && <Banner variant="default">{success}</Banner>}
            <form onSubmit={handleForgot} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <Input label={t("auth.email")} type="email" value={forgotEmail} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForgotEmail(e.target.value)} />
              <Button type="submit" variant="primary" size="lg" loading={loading}>{t("auth.sendResetLink")}</Button>
            </form>
            <Button variant="secondary" size="lg" icon={<ArrowLeft />} onClick={() => switchPanel("login")}>
              {t("auth.backToLogin")}
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
