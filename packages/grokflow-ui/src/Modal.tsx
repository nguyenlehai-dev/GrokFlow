import type { ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number | string;
}

/** Minimal modal — no portal magic (works fine inside an iframe's body).
 *  Backdrop click closes; body scroll is intentionally NOT locked because
 *  parent shell may want to keep its own scroll behaviour. */
export function Modal({ open, onClose, title, children, footer, maxWidth = 560 }: ModalProps) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--gf-bg)",
          color: "var(--gf-fg)",
          border: "1px solid var(--gf-border)",
          borderRadius: "var(--gf-radius)",
          maxWidth,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 50px -10px rgba(0,0,0,0.3)",
        }}
      >
        {title && (
          <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--gf-border)", fontWeight: 600 }}>
            {title}
          </div>
        )}
        <div style={{ padding: "1.25rem" }}>{children}</div>
        {footer && (
          <div style={{ padding: "0.75rem 1.25rem", borderTop: "1px solid var(--gf-border)", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
