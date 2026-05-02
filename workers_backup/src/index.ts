import type { Env } from "./db";
import { initAdmin, getCurrentUser, corsHeaders, jsonResponse } from "./db";
import { handleLogin, handleRegister, handleLogout, handleForgotPassword, handleResetPassword, handleChangePassword, handleMe, handleVerify2FA, handle2FASetup, handle2FAEnable, handle2FADisable } from "./auth";
import { handlePasskeyRegisterOptions, handlePasskeyRegisterVerify, handlePasskeyLoginOptions, handlePasskeyLoginVerify, handlePasskeyList, handlePasskeyDelete } from "./passkey";
import { handleListTickets, handleCreateTicket, handleGetTicket, handleUpdateTicket, handleAddMessage, handleCloseTicket, handleDeleteTicket, handleUpload, handleDownloadAttachment, handleTypingSignal, handleTypingCheck, handleStats } from "./tickets";
import { handleGetSettings, handleUpdateSettings, handleListUsers, handleUpdateUser, handleDeleteUser, handleGetLoginLogs, handleUpdateLocale } from "./settings";
import { sendTestEmail } from "./email";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      await initAdmin(env.DB);

      // Auth
      if (path === "/api/auth/login" && method === "POST") return handleLogin(env, request);
      if (path === "/api/auth/register" && method === "POST") return handleRegister(env, request);
      if (path === "/api/auth/logout" && method === "POST") return handleLogout(env, request);
      if (path === "/api/auth/forgot-password" && method === "POST") return handleForgotPassword(env, request);
      if (path === "/api/auth/reset-password" && method === "POST") return handleResetPassword(env, request);
      if (path === "/api/auth/me" && method === "GET") return handleMe(env, request);
      if (path === "/api/auth/change-password" && method === "POST") return handleChangePassword(env, request);
      if (path === "/api/auth/2fa/verify" && method === "POST") return handleVerify2FA(env, request);
      if (path === "/api/auth/2fa/setup" && method === "POST") return handle2FASetup(env, request);
      if (path === "/api/auth/2fa/enable" && method === "POST") return handle2FAEnable(env, request);
      if (path === "/api/auth/2fa/disable" && method === "POST") return handle2FADisable(env, request);
      if (path === "/api/auth/locale" && method === "PUT") return handleUpdateLocale(env, request);

      // Passkey (WebAuthn)
      if (path === "/api/auth/passkey/register/options" && method === "POST") return handlePasskeyRegisterOptions(env, request);
      if (path === "/api/auth/passkey/register/verify" && method === "POST") return handlePasskeyRegisterVerify(env, request);
      if (path === "/api/auth/passkey/login/options" && method === "POST") return handlePasskeyLoginOptions(env, request);
      if (path === "/api/auth/passkey/login/verify" && method === "POST") return handlePasskeyLoginVerify(env, request);
      if (path === "/api/auth/passkey/list" && method === "GET") return handlePasskeyList(env, request);
      const passkeyMatch = path.match(/^\/api\/auth\/passkey\/([^/]+)$/);
      if (passkeyMatch && method === "DELETE") return handlePasskeyDelete(env, request, passkeyMatch[1]);

      // Tickets
      if (path === "/api/tickets" && method === "GET") return handleListTickets(env, request);
      if (path === "/api/tickets" && method === "POST") return handleCreateTicket(env, request);
      if (path === "/api/stats" && method === "GET") return handleStats(env, request);

      // Ticket detail / messages / close / delete
      const ticketMatch = path.match(/^\/api\/tickets\/([^/]+)$/);
      const msgMatch = path.match(/^\/api\/tickets\/([^/]+)\/messages$/);
      const closeMatch = path.match(/^\/api\/tickets\/([^/]+)\/close$/);

      if (ticketMatch) {
        const id = ticketMatch[1];
        if (method === "GET") return handleGetTicket(env, request, id);
        if (method === "PUT") return handleUpdateTicket(env, request, id);
        if (method === "DELETE") return handleDeleteTicket(env, request, id);
      }
      if (msgMatch && method === "POST") return handleAddMessage(env, request, msgMatch[1]);

      // Typing indicator
      const typingMatch = path.match(/^\/api\/tickets\/([^/]+)\/typing$/);
      if (typingMatch) {
        if (method === "POST") return handleTypingSignal(env, request, typingMatch[1]);
        if (method === "GET") return handleTypingCheck(env, request, typingMatch[1]);
      }
      if (closeMatch && method === "PUT") return handleCloseTicket(env, request, closeMatch[1]);

      // File upload
      const uploadMatch = path.match(/^\/api\/tickets\/([^/]+)\/upload$/);
      if (uploadMatch && method === "POST") return handleUpload(env, request, uploadMatch[1]);

      // File download
      const attachMatch = path.match(/^\/api\/attachments\/(.+)$/);
      if (attachMatch && method === "GET") return handleDownloadAttachment(env, request, attachMatch[1]);

      // Settings
      if (path === "/api/settings" && method === "GET") return handleGetSettings(env, request);
      if (path === "/api/settings" && method === "PUT") return handleUpdateSettings(env, request);

      // Login logs
      if (path === "/api/login-logs" && method === "GET") return handleGetLoginLogs(env, request);

      // Test email
      if (path === "/api/test-email" && method === "POST") {
        const user = await getCurrentUser(env.DB, request);
        if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
        if (user.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403);
        const { email } = await request.json() as { email: string };
        if (!email) return jsonResponse({ error: "Missing email" }, 400);
        const result = await sendTestEmail(env, email);
        if (result.ok) return jsonResponse({ message: "Test email sent" });
        return jsonResponse({ error: result.error || "Failed to send" }, 500);
      }

      // Users
      if (path === "/api/users" && method === "GET") return handleListUsers(env, request);
      const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch) {
        if (method === "PUT") return handleUpdateUser(env, request, userMatch[1]);
        if (method === "DELETE") return handleDeleteUser(env, request, userMatch[1]);
      }

      // Health
      if (path === "/api/health") return jsonResponse({ status: "ok" });

      // Public settings (turnstile site key, registration enabled)
      if (path === "/api/public-settings" && method === "GET") {
        const tsKey = await env.DB.prepare("SELECT value FROM settings WHERE key = 'turnstile_site_key'").first();
        const tsEnabled = await env.DB.prepare("SELECT value FROM settings WHERE key = 'turnstile_enabled'").first();
        const regEnabled = await env.DB.prepare("SELECT value FROM settings WHERE key = 'registration_enabled'").first();
        return jsonResponse({
          turnstile_enabled: tsEnabled?.value === "true",
          turnstile_site_key: tsKey?.value || "",
          registration_enabled: regEnabled?.value !== "false",
        });
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (err: any) {
      return jsonResponse({ error: err.message || "Internal server error" }, 500);
    }
  },
};
