import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";

type Locale = "en" | "zh" | "ja";
type Translations = Record<string, string>;

const locales: Record<Locale, Translations> = { en, zh, ja };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem("locale");
    if (stored === "zh-TW") {
      localStorage.setItem("locale", "zh");
      return "zh";
    }
    if (stored && stored in locales) return stored as Locale;
    return "zh";
  });

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem("locale", l);
    setLocaleState(l);
    // Persist to backend (fire-and-forget)
    const token = localStorage.getItem("auth_token");
    if (token) {
      const API_BASE = import.meta.env.VITE_API_BASE || "";
      fetch(`${API_BASE}/api/auth/locale`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ locale: l }),
      }).catch(() => {});
    }
  }, []);

  const t = useCallback((key: string, params?: Record<string, string>): string => {
    let result = locales[locale][key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{${k}\\}`, "g"), v);
      }
    }
    return result;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}

export type { Locale };
