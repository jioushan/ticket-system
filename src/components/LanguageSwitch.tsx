import { useState, useRef, useEffect } from "react";
import { Button } from "@cloudflare/kumo";
import { Globe } from "@phosphor-icons/react";
import { useTranslation, type Locale } from "../i18n/I18nContext";

const localeOptions: { value: Locale; label: string }[] = [
  { value: "en", label: "ENG" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "JP" },
];

export default function LanguageSwitch() {
  const { locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Button
        variant="ghost"
        size="sm"
        shape="square"
        aria-label="Language"
        onClick={() => setOpen(!open)}
      >
        <Globe />
      </Button>
      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: "0.25rem",
          background: "var(--color-kumo-surface, #fff)",
          border: "1px solid var(--color-kumo-hairline)",
          borderRadius: "0.375rem",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          zIndex: 100,
          minWidth: "100px",
        }}>
          {localeOptions.map((opt) => (
            <div
              key={opt.value}
              onClick={() => {
                setLocale(opt.value);
                setOpen(false);
              }}
              style={{
                padding: "0.5rem 0.75rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                background: locale === opt.value ? "var(--color-kumo-primary, #e0e0e0)" : "transparent",
                color: "var(--text-color-kumo-default)",
                borderRadius: "0.375rem",
              }}
              onMouseEnter={(e) => {
                if (locale !== opt.value) {
                  (e.target as HTMLElement).style.background = "var(--color-kumo-hover, #f5f5f5)";
                }
              }}
              onMouseLeave={(e) => {
                if (locale !== opt.value) {
                  (e.target as HTMLElement).style.background = "transparent";
                }
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
