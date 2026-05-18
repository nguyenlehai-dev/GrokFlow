import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

export interface ToastOptions {
  message: string;
  variant?: "success" | "error" | "info";
  durationMs?: number;
}

interface ToastEntry extends Required<ToastOptions> {
  id: number;
}

interface ToastCtx {
  toast: (opts: ToastOptions | string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

let nextId = 0;

/** Wrap your module's App in <ToastProvider>; useToast() inside.
 *  We don't use a portal — the container is rendered inline at the
 *  bottom-right of the provider, which is sufficient for iframed UIs. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const push = useCallback((opts: ToastOptions | string) => {
    const norm: ToastEntry = {
      id: nextId++,
      message: typeof opts === "string" ? opts : opts.message,
      variant: (typeof opts === "object" && opts.variant) || "info",
      durationMs: (typeof opts === "object" && opts.durationMs) || 4000,
    };
    setToasts((cur) => [...cur, norm]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== norm.id)), norm.durationMs);
  }, []);

  return (
    <Ctx.Provider value={{ toast: push }}>
      {children}
      <div
        style={{
          position: "fixed",
          right: "1rem",
          bottom: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          zIndex: 2000,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              pointerEvents: "auto",
              padding: "0.6rem 0.9rem",
              borderRadius: "var(--gf-radius)",
              color: "#fff",
              background:
                t.variant === "success" ? "var(--gf-success)"
                : t.variant === "error" ? "var(--gf-danger)"
                : "var(--gf-primary)",
              boxShadow: "0 4px 12px -2px rgba(0,0,0,0.25)",
              minWidth: "240px",
              maxWidth: "400px",
              fontSize: "0.875rem",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Allow modules to call useToast() before mounting the provider; just
    // log instead of throwing so a partial provider tree doesn't crash
    // the whole iframe.
    return {
      toast: (opts: ToastOptions | string) =>
        console.warn("[@grokflow/ui] useToast() without ToastProvider:", opts),
    } as ToastCtx;
  }
  return ctx;
}
