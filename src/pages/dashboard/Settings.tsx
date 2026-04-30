import { useState } from "react";
import { Text, Input, InputArea, Button, Banner, Badge, Switch, Dialog, Table } from "@cloudflare/kumo";
import { useTranslation } from "../../i18n/I18nContext";
import { useAuth } from "../../context/AuthContext";

interface MockUser {
  id: string; username: string; email: string; role: "admin" | "user";
  status: "active" | "disabled"; createdAt: string; lastLogin: string; lastIp: string;
}

const mockUsers: MockUser[] = [
  { id: "u-1", username: "admin", email: "admin@jsmsr.com", role: "admin", status: "active", createdAt: "2026-01-01", lastLogin: "2026-05-01 10:30", lastIp: "127.0.0.1" },
  { id: "u-2", username: "user1", email: "user1@jsmsr.com", role: "user", status: "active", createdAt: "2026-02-15", lastLogin: "2026-04-30 08:00", lastIp: "192.168.1.10" },
  { id: "u-3", username: "user2", email: "user2@jsmsr.com", role: "user", status: "disabled", createdAt: "2026-03-01", lastLogin: "2026-04-20 15:00", lastIp: "10.0.0.5" },
];

export default function Settings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [saved, setSaved] = useState(false);

  // Profile
  const [username, setUsername] = useState(user?.username ?? "admin");
  const [email, setEmail] = useState("admin@jsmsr.com");

  // Admin settings
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileSecretKey, setTurnstileSecretKey] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [allowedFormats, setAllowedFormats] = useState("zip,jpg,png");
  const [maxFileSize, setMaxFileSize] = useState("5");

  // Email templates
  const [newTicketSubject, setNewTicketSubject] = useState("[工單系統] 新工單: {title}");
  const [newTicketBody, setNewTicketBody] = useState("<h2>新工單已建立</h2><p>工單編號: {ticket_id}</p><p>標題: {title}</p>");
  const [replySubject, setReplySubject] = useState("[工單系統] 工單回覆: {title}");
  const [replyBody, setReplyBody] = useState("<h2>工單有新回覆</h2><p>工單編號: {ticket_id}</p><p>回覆內容: {content}</p>");
  const [closedSubject, setClosedSubject] = useState("[工單系統] 工單已關閉: {title}");
  const [closedBody, setClosedBody] = useState("<h2>工單已關閉</h2><p>工單編號: {ticket_id}</p><p>標題: {title}</p>");

  // Users management
  const [users, setUsers] = useState(mockUsers);
  const [deleteUser, setDeleteUser] = useState<MockUser | null>(null);

  const handleSave = () => {
    // TODO: API call to save all settings
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleToggleUserStatus = (id: string) => {
    setUsers(users.map(u => u.id === id ? { ...u, status: u.status === "active" ? "disabled" : "active" } : u));
  };

  const handleToggleUserRole = (id: string) => {
    setUsers(users.map(u => u.id === id ? { ...u, role: u.role === "admin" ? "user" : "admin" } : u));
  };

  const handleDeleteUser = () => {
    if (!deleteUser) return;
    setUsers(users.filter(u => u.id !== deleteUser.id));
    setDeleteUser(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 800, width: "100%" }}>
      {saved && <Banner variant="default">{t("settings.saved")}</Banner>}

      {/* Profile section */}
      <section>
        <Text variant="heading3" as="h2">{t("settings.profile")}</Text>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          <Input label={t("settings.username")} value={username} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)} />
          <Input label={t("settings.email")} type="email" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
          <div>
            <Text size="sm" variant="secondary">{t("settings.lastLogin")}</Text>
            <Text>2026-05-01 10:30:00 (127.0.0.1)</Text>
          </div>
          <div>
            <Text size="sm" variant="secondary">{t("settings.accountCreated")}</Text>
            <Text>2026-01-01</Text>
          </div>
          <Button variant="secondary" onClick={() => {}}>{t("settings.resetPassword")}</Button>
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
                      <Badge variant={u.status === "active" ? "success" : "error"}>{u.status === "active" ? t("settings.active") : t("settings.disabled")}</Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Button size="sm" variant="outline" onClick={() => handleToggleUserStatus(u.id)}>
                          {u.status === "active" ? t("settings.disabled") : t("settings.enabled")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleToggleUserRole(u.id)}>
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

      {/* Admin: Email Templates */}
      {isAdmin && (
        <section>
          <Text variant="heading3" as="h2">{t("settings.emailTemplates")}</Text>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "1rem" }}>
            {[
              { label: t("settings.newTicketTemplate"), subject: newTicketSubject, setSubject: setNewTicketSubject, body: newTicketBody, setBody: setNewTicketBody },
              { label: t("settings.replyTemplate"), subject: replySubject, setSubject: setReplySubject, body: replyBody, setBody: setReplyBody },
              { label: t("settings.closedTemplate"), subject: closedSubject, setSubject: setClosedSubject, body: closedBody, setBody: setClosedBody },
            ].map((tpl) => (
              <div key={tpl.label} style={{ padding: "1rem", borderRadius: 8, border: "1px solid var(--color-kumo-hairline)" }}>
                <Text bold>{tpl.label}</Text>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
                  <Input label={t("settings.subject")} value={tpl.subject} onChange={(e: React.ChangeEvent<HTMLInputElement>) => tpl.setSubject(e.target.value)} />
                  <InputArea label={t("settings.body")} value={tpl.body} onValueChange={tpl.setBody} rows={3} />
                </div>
              </div>
            ))}
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
                  <Input label={t("settings.secretKey")} value={turnstileSecretKey} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTurnstileSecretKey(e.target.value)} />
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
