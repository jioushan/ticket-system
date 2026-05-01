import { useState, useEffect, useCallback } from "react";
import { Text, Input, SensitiveInput, Button, Banner, Badge, Switch, Dialog, Table } from "@cloudflare/kumo";
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

export default function Settings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Profile
  const [username] = useState(user?.username ?? "");
  const [email] = useState(user?.email ?? "");

  // Admin settings
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [allowedFormats, setAllowedFormats] = useState("zip,jpg,png");
  const [maxFileSize, setMaxFileSize] = useState("5");

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

  useEffect(() => {
    // Check 2FA status from user profile
    api.auth.me().then((data: any) => {
      setHas2fa(!!data.has2fa);
    }).catch(() => {});
    Promise.all([fetchSettings(), fetchUsers(), fetchPasskeys()]).finally(() => setLoading(false));
  }, [fetchSettings, fetchUsers, fetchPasskeys]);

  const handleSetup2FA = async () => {
    setTwoFALoading(true);
    setTwoFAResult(null);
    try {
      const data = await api.auth.setup2fa();
      setTwoFASetup(data);
    } catch (err: any) {
      setTwoFAResult({ ok: false, msg: err.message || "設置失敗" });
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
      // 互斥：啟用 TOTP 後刪除所有 Passkey
      for (const pk of passkeys) {
        await api.auth.passkeyDelete(pk.id).catch(() => {});
      }
      setPasskeys([]);
      setTwoFAResult({ ok: true, msg: "2FA 已啟用（Passkey 已移除）" });
    } catch (err: any) {
      setTwoFAResult({ ok: false, msg: err.message || "驗證失敗" });
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
      setTwoFAResult({ ok: true, msg: "2FA 已關閉" });
    } catch (err: any) {
      setTwoFAResult({ ok: false, msg: err.message || "驗證失敗" });
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
      // 後端自動關閉 TOTP 2FA（互斥）
      setHas2fa(false);
      setPasskeyResult({ ok: true, msg: "Passkey 已註冊（TOTP 2FA 已自動關閉）" });
      await fetchPasskeys();
    } catch (err: any) {
      setPasskeyResult({ ok: false, msg: err.message || "註冊失敗" });
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    try {
      await api.auth.passkeyDelete(id);
      setPasskeys(passkeys.filter(p => p.id !== id));
    } catch (err: any) {
      alert(err.message || "刪除失敗");
    }
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) return;
    if (newPw !== confirmPw) { setPwResult({ ok: false, msg: "新密碼不一致" }); return; }
    if (newPw.length < 4) { setPwResult({ ok: false, msg: "密碼至少4位" }); return; }
    setPwLoading(true);
    setPwResult(null);
    try {
      await api.auth.changePassword(currentPw, newPw);
      setPwResult({ ok: true, msg: "密碼已變更，已發送通知郵件" });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: any) {
      setPwResult({ ok: false, msg: err.message || "變更失敗" });
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
      setTestEmailResult({ ok: true, msg: "測試郵件已發送，請檢查收件箱" });
    } catch (err: any) {
      setTestEmailResult({ ok: false, msg: err.message || "發送失敗" });
    } finally {
      setTestEmailSending(false);
    }
  };

  const handleSave = async () => {
    try {
      await api.settings.update({
        turnstile_enabled: String(turnstileEnabled),
        turnstile_site_key: turnstileSiteKey,
        registration_enabled: String(registrationEnabled),
        allowed_formats: allowedFormats,
        max_file_size: String(parseInt(maxFileSize) * 1024 * 1024),
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 800, width: "100%" }}>
      {saved && <Banner variant="default">{t("settings.saved")}</Banner>}

      {/* Profile section */}
      <section>
        <Text variant="heading3" as="h2">{t("settings.profile")}</Text>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          <Input label={t("settings.username")} value={username} readOnly />
          <Input label={t("settings.email")} type="email" value={email} readOnly />
        </div>
      </section>

      {/* Change Password */}
      <section>
        <Text variant="heading3" as="h2">變更密碼</Text>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
          <SensitiveInput label="當前密碼" value={currentPw} onValueChange={setCurrentPw} />
          <SensitiveInput label="新密碼" value={newPw} onValueChange={setNewPw} />
          <SensitiveInput label="確認新密碼" value={confirmPw} onValueChange={setConfirmPw} />
          {pwResult && (
            <Banner variant={pwResult.ok ? "default" : "error"}>{pwResult.msg}</Banner>
          )}
          <Button variant="secondary" onClick={handleChangePassword} loading={pwLoading}>
            變更密碼
          </Button>
        </div>
      </section>

      {/* 2FA */}
      <section>
        <Text variant="heading3" as="h2">二步驗證 (TOTP)</Text>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
          {passkeys.length > 0 && !has2fa && (
            <Banner variant="default">已啟用 Passkey，TOTP 2FA 不可用。兩者互斥，僅可啟用其一。</Banner>
          )}
          {has2fa ? (
            <>
              <div style={{ width: "fit-content" }}><Badge variant="green">已啟用</Badge></div>
              <Text size="sm" variant="secondary">使用驗證器 App 掃描過的密鑰仍然有效。要關閉 2FA，請輸入當前驗證碼。</Text>
              <Input
                label="驗證碼"
                placeholder="輸入 6 位驗證碼"
                value={twoFACode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTwoFACode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
              />
              <Button variant="destructive" onClick={handleDisable2FA} loading={twoFALoading} disabled={twoFACode.length !== 6}>
                關閉 2FA
              </Button>
            </>
          ) : twoFASetup ? (
            <>
              <Text size="sm">使用驗證器 App（Google Authenticator、Authy 等）掃描 QR Code：</Text>
              <div style={{ textAlign: "center", padding: "1rem", background: "#fff", borderRadius: 8, display: "inline-block", alignSelf: "center" }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(twoFASetup.otpauth_url)}`}
                  alt="QR Code"
                  style={{ width: 200, height: 200 }}
                />
              </div>
              <Text size="sm" variant="secondary">或手動輸入密鑰：<code style={{ padding: "2px 6px", background: "var(--color-kumo-fill)", borderRadius: 4, fontSize: 13 }}>{twoFASetup.secret}</code></Text>
              <Input
                label="驗證碼"
                placeholder="輸入 6 位驗證碼確認"
                value={twoFACode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTwoFACode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
              />
              <Button variant="primary" onClick={handleEnable2FA} loading={twoFALoading} disabled={twoFACode.length !== 6}>
                啟用 2FA
              </Button>
              <Button variant="secondary" onClick={() => { setTwoFASetup(null); setTwoFACode(""); }}>取消</Button>
            </>
          ) : (
            <>
              <Text size="sm" variant="secondary">啟用二步驗證後，登入時需要輸入驗證器 App 產生的驗證碼。</Text>
              <Button variant="secondary" onClick={handleSetup2FA} loading={twoFALoading}>
                設置 2FA
              </Button>
            </>
          )}
          {twoFAResult && (
            <Banner variant={twoFAResult.ok ? "default" : "error"}>{twoFAResult.msg}</Banner>
          )}
        </div>
      </section>

      {/* Passkey */}
      <section>
        <Text variant="heading3" as="h2">Passkey（通行密鑰）</Text>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
          <Text size="sm" variant="secondary">使用指紋、Face ID 或硬體安全金鑰作為二步驗證。與 TOTP 2FA 互斥。</Text>
          {has2fa && passkeys.length === 0 && (
            <Banner variant="default">已啟用 TOTP 2FA，Passkey 不可用。兩者互斥，僅可啟用其一。</Banner>
          )}
          {passkeys.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {passkeys.map((pk) => (
                <div key={pk.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-kumo-hairline)" }}>
                  <div>
                    <Text size="sm" bold>{pk.credential_id.slice(0, 20)}...</Text>
                    <Text size="sm" variant="secondary">註冊於 {pk.created_at}</Text>
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => handleDeletePasskey(pk.id)}>刪除</Button>
                </div>
              ))}
            </div>
          )}
          {passkeyResult && <Banner variant={passkeyResult.ok ? "default" : "error"}>{passkeyResult.msg}</Banner>}
          <Button variant="secondary" onClick={handleRegisterPasskey} loading={passkeyLoading}>
            註冊新 Passkey
          </Button>
        </div>
      </section>

      {/* Admin: User Management */}
      {isAdmin && (
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

      {/* Admin: System Settings */}
      {isAdmin && (
        <section>
          <Text variant="heading3" as="h2">{t("settings.systemSettings")}</Text>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "1rem" }}>
            {/* Turnstile */}
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

            {/* Registration */}
            <div style={{ padding: "1rem", borderRadius: 8, border: "1px solid var(--color-kumo-hairline)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text bold>{t("settings.registration")}</Text>
                <Switch checked={registrationEnabled} onCheckedChange={setRegistrationEnabled} />
              </div>
            </div>

            {/* Attachment settings */}
            <div style={{ padding: "1rem", borderRadius: 8, border: "1px solid var(--color-kumo-hairline)" }}>
              <Text bold>附件設定</Text>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
                <Input label={t("settings.allowedFormats")} value={allowedFormats} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAllowedFormats(e.target.value)} description="用逗號分隔，例如: zip,jpg,png" />
                <Input label={t("settings.maxFileSize") + " (MB)"} type="number" value={maxFileSize} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxFileSize(e.target.value)} />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Save button */}
      <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--color-kumo-hairline)" }}>
        <Button variant="primary" size="lg" onClick={handleSave}>{t("settings.save")}</Button>
      </div>

      {/* Admin: Test Email */}
      {isAdmin && (
        <section>
          <Text variant="heading3" as="h2">郵件測試</Text>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <Input
                  label="測試收件箱"
                  type="email"
                  placeholder="輸入郵箱地址"
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
                發送測試
              </Button>
            </div>
            {testEmailResult && (
              <Banner variant={testEmailResult.ok ? "default" : "error"}>
                {testEmailResult.msg}
              </Banner>
            )}
          </div>
        </section>
      )}

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
