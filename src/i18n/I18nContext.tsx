import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import en from "./locales/en.json";
import zhTW from "./locales/zh-TW.json";
import ja from "./locales/ja.json";

type Locale = "en" | "zh-TW" | "ja";
type Translations = Record<string, string>;

const locales: Record<Locale, Translations> = { en, "zh-TW": zhTW, ja };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    return (localStorage.getItem("locale") as Locale) || "zh-TW";
  });

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem("locale", l);
    setLocaleState(l);
  }, []);

  const t = useCallback((key: string): string => {
    return locales[locale][key] || key;
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
