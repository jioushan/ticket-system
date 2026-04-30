import { useState, useEffect, useCallback } from "react";
import { Text, Input, Button, Banner, Badge, Switch, Dialog, Table } from "@cloudflare/kumo";
import { useTranslation } from "../../i18n/I18nContext";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

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

  useEffect(() => {
    Promise.all([fetchSettings(), fetchUsers()]).finally(() => setLoading(false));
  }, [fetchSettings, fetchUsers]);

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
