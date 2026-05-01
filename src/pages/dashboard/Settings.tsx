import { useState, useEffect, useCallback } from "react";
import { Text, Input, SensitiveInput, Button, Banner, Badge, Switch, Dialog, Table, Tabs, Select } from "@cloudflare/kumo";
import { useTranslation } from "../../i18n/I18nContext";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { startRegistration } from "@simplewebauthn/browser";

interface ApiUser {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  created_at: string;
  last_login_at: string | null;
  last_login_ip: string | null;
}

interface LoginLog {
  id: string;
  user_id: string;
  ip: string;
  user_agent: string;
  logged_in_at: string;
  username: string;
}

export default function Settings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");

  // Profile
  const [username] = useState(user?.username ?? "");
  const [email] = useState(user?.email ?? "");

  // Login logs
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);

  // Admin settings
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [allowedFormats, setAllowedFormats] = useState("zip,jpg,png");
  const [maxFileSize, setMaxFileSize] = useState("5");

  // Email settings
  const [emailProvider, setEmailProvider] = useState<"sendgrid" | "resend" | "mailgun" | "custom">("sendgrid");
  const [emailApiKey, setEmailApiKey] = useState("");
  const [emailDomain, setEmailDomain] = useState("");
  const [emailWebhookUrl, setEmailWebhookUrl] = useState("");
  const [emailSender, setEmailSender] = useState("");

  // Users management
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [deleteUser, setDeleteUser] = useState<ApiUser | null>(null);

  // Test email
  const [testEmail, setTestEmail] = useState("");
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Change password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwResult, setPwResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // 2FA
  const [has2fa, setHas2fa] = useState(false);
  const [twoFASetup, setTwoFASetup] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAResult, setTwoFAResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Passkey
  const [passkeys, setPasskeys] = useState<{ id: string; credential_id: string; created_at: string }[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyResult, setPasskeyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.settings.get();
      if (data.turnstile_enabled) setTurnstileEnabled(data.turnstile_enabled === "true");
      if (data.turnstile_site_key) setTurnstileSiteKey(data.turnstile_site_key);
      if (data.registration_enabled) setRegistrationEnabled(data.registration_enabled === "true");
      if (data.allowed_formats) setAllowedFormats(data.allowed_formats);
      if (data.max_file_size) setMaxFileSize(String(parseInt(data.max_file_size) / 1024 / 1024));
      if (data.email_config) {
        try {
          const ec = JSON.parse(data.email_config);
          if (ec.provider) setEmailProvider(ec.provider);
          if (ec.apiKey) setEmailApiKey(ec.apiKey);
          if (ec.domain) setEmailDomain(ec.domain);
          if (ec.webhookUrl) setEmailWebhookUrl(ec.webhookUrl);
          if (ec.sender) setEmailSender(ec.sender);
        } catch {}
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await api.users.list();
      setUsers(data);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  }, [isAdmin]);

  const fetchPasskeys = useCallback(async () => {
    try {
      const data = await api.auth.passkeyList();
      setPasskeys(data);
    } catch {}
  }, []);

  const fetchLoginLogs = useCallback(async () => {
    try {
      const data = await api.loginLogs();
      setLoginLogs(data);
    } catch (err) {
      console.error("Failed to fetch login logs:", err);
    }
  }, []);

  useEffect(() => {
    api.auth.me().then((data: any) => {
      setHas2fa(!!data.has2fa);
    }).catch(() => {});
    Promise.all([fetchSettings(), fetchUsers(), fetchPasskeys(), fetchLoginLogs()]).finally(() => setLoading(false));
  }, [fetchSettings, fetchUsers, fetchPasskeys, fetchLoginLogs]);

  const handleSetup2FA = async () => {
    setTwoFALoading(true);
    setTwoFAResult(null);
    try {
      const data = await api.auth.setup2fa();
      setTwoFASetup(data);
    } catch (err: any) {
      setTwoFAResult({ ok: false, msg: err.message || t("settings.setupFailed") });
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleEnable2FA = async () => {
    if (!twoFACode || twoFACode.length !== 6) return;
    setTwoFALoading(true);
    setTwoFAResult(null);
    try {
      await api.auth.enable2fa(twoFACode);
      setHas2fa(true);
      setTwoFASetup(null);
      setTwoFACode("");
      for (const pk of passkeys) {
        await api.auth.passkeyDelete(pk.id).catch(() => {});
      }
      setPasskeys([]);
      setTwoFAResult({ ok: true, msg: t("settings.twoFAEnabled") });
    } catch (err: any) {
      setTwoFAResult({ ok: false, msg: err.message || t("settings.verificationFailed") });
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!twoFACode || twoFACode.length !== 6) return;
    setTwoFALoading(true);
    setTwoFAResult(null);
    try {
      await api.auth.disable2fa(twoFACode);
      setHas2fa(false);
      setTwoFACode("");
      setTwoFAResult({ ok: true, msg: t("settings.twoFADisabled") });
    } catch (err: any) {
      setTwoFAResult({ ok: false, msg: err.message || t("settings.verificationFailed") });
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setPasskeyLoading(true);
    setPasskeyResult(null);
    try {
      const { options, challengeToken } = await api.auth.passkeyRegisterOptions();
      const response = await startRegistration({ optionsJSON: options });
      await api.auth.passkeyRegisterVerify(response, challengeToken);
      setHas2fa(false);
      setPasskeyResult({ ok: true, msg: t("settings.passkeyRegistered") });
      await fetchPasskeys();
    } catch (err: any) {
      setPasskeyResult({ ok: false, msg: err.message || t("settings.passkeyDeleteFailed") });
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    try {
      await api.auth.passkeyDelete(id);
      setPasskeys(passkeys.filter(p => p.id !== id));
    } catch (err: any) {
      alert(err.message || t("settings.passkeyDeleteFailed"));
    }
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) return;
    if (newPw !== confirmPw) { setPwResult({ ok: false, msg: t("settings.passwordMismatch") }); return; }
    if (newPw.length < 4) { setPwResult({ ok: false, msg: t("settings.passwordTooShort") }); return; }
    setPwLoading(true);
    setPwResult(null);
    try {
      await api.auth.changePassword(currentPw, newPw);
      setPwResult({ ok: true, msg: t("settings.passwordChanged") });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: any) {
      setPwResult({ ok: false, msg: err.message || t("settings.passwordChangeFailed") });
    } finally {
      setPwLoading(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) return;
    setTestEmailSending(true);
    setTestEmailResult(null);
    try {
      await api.testEmail(testEmail);
      setTestEmailResult({ ok: true, msg: t("settings.testEmailSent") });
    } catch (err: any) {
      setTestEmailResult({ ok: false, msg: err.message || t("settings.testEmailFailed") });
    } finally {
      setTestEmailSending(false);
    }
  };

  const handleSave = async () => {
    try {
      const emailConfig = JSON.stringify({
        provider: emailProvider,
        apiKey: emailApiKey,
        domain: emailDomain,
        webhookUrl: emailWebhookUrl,
        sender: emailSender,
      });
      await api.settings.update({
        turnstile_enabled: String(turnstileEnabled),
        turnstile_site_key: turnstileSiteKey,
        registration_enabled: String(registrationEnabled),
        allowed_formats: allowedFormats,
        max_file_size: String(parseInt(maxFileSize) * 1024 * 1024),
        email_config: emailConfig,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message || "Failed to save settings");
    }
  };

  const handleToggleUserStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "disabled" : "active";
    try {
      await api.users.update(id, { status: newStatus });
      setUsers(users.map(u => u.id === id ? { ...u, status: newStatus as "active" | "disabled" } : u));
    } catch (err: any) {
      alert(err.message || "Failed to update user");
    }
  };

  const handleToggleUserRole = async (id: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    try {
      await api.users.update(id, { role: newRole });
      setUsers(users.map(u => u.id === id ? { ...u, role: newRole as "admin" | "user" } : u));
    } catch (err: any) {
      alert(err.message || "Failed to update user");
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    try {
      await api.users.delete(deleteUser.id);
      setUsers(users.filter(u => u.id !== deleteUser.id));
      setDeleteUser(null);
    } catch (err: any) {
      alert(err.message || "Failed to delete user");
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: "2rem" }}><Text>{t("common.loading") || "Loading..."}</Text></div>;
  }

  const tabItems = [
    { value: "profile", label: t("settings.tab.profile") },
    { value: "password", label: t("settings.tab.password") },
    { value: "security", label: t("settings.tab.security") },
    ...(isAdmin ? [{ value: "users", label: t("settings.tab.users") }] : []),
    ...(isAdmin ? [{ value: "system", label: t("settings.tab.system") }] : []),
    ...(isAdmin ? [{ value: "email", label: t("settings.tab.email") }] : []),
  ];

  return (
    <div style={{ maxWidth: 800, width: "100%" }}>
      {saved && <Banner variant="default">{t("settings.saved")}</Banner>}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        variant="underline"
        tabs={tabItems}
      />

      <div style={{ marginTop: "1.5rem" }}>
        {/* Tab: Profile */}
        {activeTab === "profile" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            <section>
              <Text variant="heading3" as="h2">{t("settings.profile")}</Text>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
                <Input label={t("settings.username")} value={username} readOnly />
                <Input label={t("settings.email")} type="email" value={email} readOnly />
              </div>
            </section>

            <section>
              <Text variant="heading3" as="h2">{t("settings.loginLog")}</Text>
              <div style={{ marginTop: "1rem", overflowX: "auto" }}>
                {loginLogs.length === 0 ? (
                  <Text variant="secondary">{t("common.noData")}</Text>
                ) : (
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.Head>{t("settings.loginLog.time")}</Table.Head>
                        <Table.Head>{t("settings.loginLog.ip")}</Table.Head>
                        <Table.Head>{t("settings.loginLog.device")}</Table.Head>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {loginLogs.map((log) => (
                        <Table.Row key={log.id}>
                          <Table.Cell><Text size="sm">{log.logged_in_at}</Text></Table.Cell>
                          <Table.Cell><Text size="sm">{log.ip}</Text></Table.Cell>
                          <Table.Cell><Text size="sm">{log.user_agent ? log.user_agent.slice(0, 80) : "-"}</Text></Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                )}
              </div>
            </section>
          </div>
        )}

        {/* Tab: Change Password */}
        {activeTab === "password" && (
          <section>
            <Text variant="heading3" as="h2">{t("settings.changePassword")}</Text>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem", maxWidth: 400 }}>
              <SensitiveInput label={t("settings.currentPassword")} value={currentPw} onValueChange={setCurrentPw} />
              <SensitiveInput label={t("settings.newPassword")} value={newPw} onValueChange={setNewPw} />
              <SensitiveInput label={t("settings.confirmNewPassword")} value={confirmPw} onValueChange={setConfirmPw} />
              {pwResult && (
                <Banner variant={pwResult.ok ? "default" : "error"}>{pwResult.msg}</Banner>
              )}
              <Button variant="secondary" onClick={handleChangePassword} loading={pwLoading}>
                {t("settings.changePassword")}
              </Button>
            </div>
          </section>
        )}

        {/* Tab: Security (2FA + Passkey) */}
        {activeTab === "security" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            <section>
              <Text variant="heading3" as="h2">{t("settings.twoFASetupTitle")}</Text>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
                {passkeys.length > 0 && !has2fa && (
                  <Banner variant="default">{t("settings.mutualExclusionPasskey")}</Banner>
                )}
                {has2fa ? (
                  <>
                    <div style={{ width: "fit-content" }}><Badge variant="green">{t("settings.twoFAEnabledBadge")}</Badge></div>
                    <Text size="sm" variant="secondary">{t("settings.twoFADisableDesc")}</Text>
                    <Input
                      label={t("settings.verificationCode")}
                      placeholder={t("settings.verificationCodePlaceholder")}
                      value={twoFACode}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTwoFACode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      maxLength={6}
                    />
                    <Button variant="destructive" onClick={handleDisable2FA} loading={twoFALoading} disabled={twoFACode.length !== 6}>
                      {t("settings.disable2FA")}
                    </Button>
                  </>
                ) : twoFASetup ? (
                  <>
                    <Text size="sm">{t("settings.scanQR")}</Text>
                    <div style={{ textAlign: "center", padding: "1rem", background: "#fff", borderRadius: 8, display: "inline-block", alignSelf: "center" }}>
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFASetup.otpauth_url)}`}
                        alt="QR Code"
                        style={{ width: 200, height: 200 }}
                      />
                    </div>
                    <Text size="sm" variant="secondary">{t("settings.manualKey")}<code style={{ padding: "2px 6px", background: "var(--color-kumo-fill)", borderRadius: 4, fontSize: 13 }}>{twoFASetup.secret}</code></Text>
                    <Input
                      label={t("settings.verificationCode")}
                      placeholder={t("settings.verificationCodePlaceholder")}
                      value={twoFACode}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTwoFACode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      maxLength={6}
                    />
                    <Button variant="primary" onClick={handleEnable2FA} loading={twoFALoading} disabled={twoFACode.length !== 6}>
                      {t("settings.enable2FA")}
                    </Button>
                    <Button variant="secondary" onClick={() => { setTwoFASetup(null); setTwoFACode(""); }}>{t("common.cancel")}</Button>
                  </>
                ) : (
                  <>
                    <Text size="sm" variant="secondary">{t("settings.twoFADesc")}</Text>
                    <Button variant="secondary" onClick={handleSetup2FA} loading={twoFALoading}>
                      {t("settings.setup2FA")}
                    </Button>
                  </>
                )}
                {twoFAResult && (
                  <Banner variant={twoFAResult.ok ? "default" : "error"}>{twoFAResult.msg}</Banner>
                )}
              </div>
            </section>

            <section>
              <Text variant="heading3" as="h2">{t("settings.passkeyTitle")}</Text>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
                <Text size="sm" variant="secondary">{t("settings.passkeyDesc")}</Text>
                {has2fa && passkeys.length === 0 && (
                  <Banner variant="default">{t("settings.mutualExclusionTOTP")}</Banner>
                )}
                {passkeys.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {passkeys.map((pk) => (
                      <div key={pk.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-kumo-hairline)" }}>
                        <div>
                          <Text size="sm" bold>{pk.credential_id.slice(0, 20)}...</Text>
                          <Text size="sm" variant="secondary">{pk.created_at}</Text>
                        </div>
                        <Button size="sm" variant="destructive" onClick={() => handleDeletePasskey(pk.id)}>{t("common.delete")}</Button>
                      </div>
                    ))}
                  </div>
                )}
                {passkeyResult && <Banner variant={passkeyResult.ok ? "default" : "error"}>{passkeyResult.msg}</Banner>}
                <Button variant="secondary" onClick={handleRegisterPasskey} loading={passkeyLoading}>
                  {t("settings.registerPasskey")}
                </Button>
              </div>
            </section>
          </div>
        )}

        {/* Tab: User Management (admin only) */}
        {activeTab === "users" && isAdmin && (
          <section>
            <Text variant="heading3" as="h2">{t("settings.userManagement")}</Text>
            <div style={{ marginTop: "1rem", overflowX: "auto" }}>
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Username</Table.Head>
                    <Table.Head>Email</Table.Head>
                    <Table.Head>{t("settings.role")}</Table.Head>
                    <Table.Head>{t("settings.status")}</Table.Head>
                    <Table.Head>{t("ticket.actions")}</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {users.map((u) => (
                    <Table.Row key={u.id}>
                      <Table.Cell><Text bold>{u.username}</Text></Table.Cell>
                      <Table.Cell><Text size="sm">{u.email}</Text></Table.Cell>
                      <Table.Cell>
                        <Badge variant={u.role === "admin" ? "blue" : "neutral"}>{u.role}</Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge variant={u.status === "active" ? "green" : "red"}>
                          {u.status === "active" ? t("settings.active") : t("settings.disabled")}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Button size="sm" variant="outline" onClick={() => handleToggleUserStatus(u.id, u.status)}>
                            {u.status === "active" ? t("settings.disabled") : t("settings.enabled")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleToggleUserRole(u.id, u.role)}>
                            {u.role === "admin" ? "→ User" : "→ Admin"}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setDeleteUser(u)}>
                            {t("settings.deleteAccount")}
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          </section>
        )}

        {/* Tab: System Settings (admin only) */}
        {activeTab === "system" && isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <section>
              <Text variant="heading3" as="h2">{t("settings.systemSettings")}</Text>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "1rem" }}>
                <div style={{ padding: "1rem", borderRadius: 8, border: "1px solid var(--color-kumo-hairline)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Text bold>{t("settings.turnstile")}</Text>
                    <Switch checked={turnstileEnabled} onCheckedChange={setTurnstileEnabled} />
                  </div>
                  {turnstileEnabled && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
                      <Input label={t("settings.siteKey")} value={turnstileSiteKey} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTurnstileSiteKey(e.target.value)} />
                    </div>
                  )}
                </div>

                <div style={{ padding: "1rem", borderRadius: 8, border: "1px solid var(--color-kumo-hairline)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Text bold>{t("settings.registration")}</Text>
                    <Switch checked={registrationEnabled} onCheckedChange={setRegistrationEnabled} />
                  </div>
                </div>

                <div style={{ padding: "1rem", borderRadius: 8, border: "1px solid var(--color-kumo-hairline)" }}>
                  <Text bold>{t("settings.attachmentSettings")}</Text>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
                    <Input label={t("settings.allowedFormats")} value={allowedFormats} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAllowedFormats(e.target.value)} description={t("settings.allowedFormatsDesc")} />
                    <Input label={t("settings.maxFileSize") + " (MB)"} type="number" value={maxFileSize} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxFileSize(e.target.value)} />
                  </div>
                </div>
              </div>
            </section>

            <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--color-kumo-hairline)" }}>
              <Button variant="primary" size="lg" onClick={handleSave}>{t("settings.save")}</Button>
            </div>
          </div>
        )}

        {/* Tab: Email Settings (admin only) */}
        {activeTab === "email" && isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            <section>
              <Text variant="heading3" as="h2">{t("settings.emailSettings")}</Text>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
                <Select
                  label={t("settings.emailProvider")}
                  value={emailProvider}
                  onValueChange={(v) => setEmailProvider(v as typeof emailProvider)}
                >
                  <Select.Option value="sendgrid">SendGrid</Select.Option>
                  <Select.Option value="resend">Resend</Select.Option>
                  <Select.Option value="mailgun">Mailgun</Select.Option>
                  <Select.Option value="custom">{t("settings.emailProviderCustom")}</Select.Option>
                </Select>

                {emailProvider !== "custom" && (
                  <SensitiveInput
                    label={t("settings.emailApiKey")}
                    value={emailApiKey}
                    onValueChange={setEmailApiKey}
                    description={t(`settings.emailApiKeyDesc.${emailProvider}`)}
                  />
                )}

                {emailProvider === "mailgun" && (
                  <Input
                    label={t("settings.emailDomain")}
                    value={emailDomain}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailDomain(e.target.value)}
                    description={t("settings.emailDomainDesc")}
                  />
                )}

                {emailProvider === "custom" && (
                  <Input
                    label={t("settings.emailWebhookUrl")}
                    value={emailWebhookUrl}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailWebhookUrl(e.target.value)}
                    description={t("settings.emailWebhookUrlDesc")}
                  />
                )}

                <Input
                  label={t("settings.emailSender")}
                  value={emailSender}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailSender(e.target.value)}
                  description={t("settings.emailSenderDesc")}
                />
              </div>
            </section>

            <section>
              <Text variant="heading3" as="h2">{t("settings.emailTest")}</Text>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      label={t("settings.testInbox")}
                      type="email"
                      placeholder={t("settings.testInboxPlaceholder")}
                      value={testEmail}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTestEmail(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    loading={testEmailSending}
                    onClick={handleTestEmail}
                    disabled={!testEmail}
                  >
                    {t("settings.sendTest")}
                  </Button>
                </div>
                {testEmailResult && (
                  <Banner variant={testEmailResult.ok ? "default" : "error"}>
                    {testEmailResult.msg}
                  </Banner>
                )}
              </div>
            </section>

            <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--color-kumo-hairline)" }}>
              <Button variant="primary" size="lg" onClick={handleSave}>{t("settings.save")}</Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete user dialog */}
      <Dialog.Root open={!!deleteUser} onOpenChange={(open) => { if (!open) setDeleteUser(null); }}>
        <Dialog size="sm" className="p-8">
          <Dialog.Title>{t("settings.deleteAccount")}</Dialog.Title>
          <Dialog.Description>{t("settings.deleteConfirm")}</Dialog.Description>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 16 }}>
            <Button variant="secondary" onClick={() => setDeleteUser(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={handleDeleteUser}>{t("common.confirm")}</Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </div>
  );
}
