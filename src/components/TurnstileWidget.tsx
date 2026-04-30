import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, any>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
}

export default function TurnstileWidget({ siteKey, onVerify, onExpire }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);

  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  const cleanup = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const renderWidget = () => {
      if (cancelled || !window.turnstile || !containerRef.current) return;
      cleanup();
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            if (!cancelled) onVerifyRef.current(token);
          },
          "expired-callback": () => {
            if (!cancelled) onExpireRef.current?.();
          },
        });
      } catch (e) {
        console.error("Turnstile render error:", e);
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      interval = setInterval(() => {
        if (window.turnstile) {
          if (interval) clearInterval(interval);
          renderWidget();
        }
      }, 200);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      cleanup();
    };
  }, [siteKey, cleanup]);

  return <div ref={containerRef} />;
}
