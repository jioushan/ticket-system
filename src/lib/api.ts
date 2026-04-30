const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  publicSettings: () => request("/api/public-settings"),
  auth: {
    login: (username: string, password: string) =>
      request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    register: (username: string, email: string, password: string, turnstileToken?: string) =>
      request("/api/auth/register", { method: "POST", body: JSON.stringify({ username, email, password, turnstileToken }) }),
    logout: () => request("/api/auth/logout", { method: "POST" }),
    forgotPassword: (email: string) =>
      request("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
    resetPassword: (token: string, newPassword: string) =>
      request("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) }),
    me: () => request("/api/auth/me"),
    changePassword: (currentPassword: string, newPassword: string) =>
      request("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
    verify2fa: (tempToken: string, code: string) =>
      request("/api/auth/2fa/verify", { method: "POST", body: JSON.stringify({ tempToken, code }) }),
    setup2fa: () => request("/api/auth/2fa/setup", { method: "POST" }),
    enable2fa: (code: string) =>
      request("/api/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) }),
    disable2fa: (code: string) =>
      request("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code }) }),
  },
  tickets: {
    list: () => request("/api/tickets"),
    get: (id: string) => request(`/api/tickets/${id}`),
    update: (id: string, data: { status?: string; priority?: string }) =>
      request(`/api/tickets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    create: (data: { title: string; description: string; priority: string; turnstileToken?: string }) =>
      request("/api/tickets", { method: "POST", body: JSON.stringify(data) }),
    upload: (ticketId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("auth_token");
      return fetch(`${API_BASE}/api/tickets/${ticketId}/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        return data;
      });
    },
    addMessage: (ticketId: string, content: string) =>
      request(`/api/tickets/${ticketId}/messages`, { method: "POST", body: JSON.stringify({ content }) }),
    close: (id: string) => request(`/api/tickets/${id}/close`, { method: "PUT" }),
    delete: (id: string) => request(`/api/tickets/${id}`, { method: "DELETE" }),
    signalTyping: (id: string) => request(`/api/tickets/${id}/typing`, { method: "POST" }),
    checkTyping: (id: string) => request(`/api/tickets/${id}/typing`),
  },
  stats: () => request("/api/stats"),
  attachments: {
    downloadUrl: (key: string) => `${API_BASE}/api/attachments/${encodeURIComponent(key)}`,
  },
  settings: {
    get: () => request("/api/settings"),
    update: (data: Record<string, string>) =>
      request("/api/settings", { method: "PUT", body: JSON.stringify(data) }),
  },
  users: {
    list: () => request("/api/users"),
    update: (id: string, data: { role?: string; status?: string }) =>
      request(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => request(`/api/users/${id}`, { method: "DELETE" }),
  },
  testEmail: (email: string) => request("/api/test-email", { method: "POST", body: JSON.stringify({ email }) }),
};
