import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { User } from "../types";
import { api } from "../lib/api";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("auth_user");
    return stored ? JSON.parse(stored) : null;
  });

  const refreshUser = useCallback(async () => {
    try {
      const freshUser = await api.auth.me();
      localStorage.setItem("auth_user", JSON.stringify(freshUser));
      setUser(freshUser);
    } catch {
      // Token invalid or expired
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      setUser(null);
    }
  }, []);

  // Verify token and get fresh user data on mount
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      refreshUser();
    }
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.auth.login(username, password);
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_user", JSON.stringify(data.user));
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    const token = localStorage.getItem("auth_token");
    if (token) api.auth.logout().catch(() => {});
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
