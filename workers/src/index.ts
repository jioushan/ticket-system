import type { Env } from "./db";
import { initAdmin, corsHeaders, jsonResponse } from "./db";
import { handleLogin, handleRegister, handleLogout, handleForgotPassword, handleResetPassword, handleMe } from "./auth";
import { handleListTickets, handleCreateTicket, handleGetTicket, handleAddMessage, handleCloseTicket, handleDeleteTicket, handleStats } from "./tickets";
import { handleGetSettings, handleUpdateSettings, handleListUsers, handleUpdateUser, handleDeleteUser } from "./settings";

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
        if (method === "DELETE") return handleDeleteTicket(env, request, id);
      }
      if (msgMatch && method === "POST") return handleAddMessage(env, request, msgMatch[1]);
      if (closeMatch && method === "PUT") return handleCloseTicket(env, request, closeMatch[1]);

      // Settings
      if (path === "/api/settings" && method === "GET") return handleGetSettings(env, request);
      if (path === "/api/settings" && method === "PUT") return handleUpdateSettings(env, request);

      // Users
      if (path === "/api/users" && method === "GET") return handleListUsers(env, request);
      const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch) {
        if (method === "PUT") return handleUpdateUser(env, request, userMatch[1]);
        if (method === "DELETE") return handleDeleteUser(env, request, userMatch[1]);
      }

      // Health
      if (path === "/api/health") return jsonResponse({ status: "ok" });

      return jsonResponse({ error: "Not found" }, 404);
    } catch (err: any) {
      return jsonResponse({ error: err.message || "Internal server error" }, 500);
    }
  },
};
