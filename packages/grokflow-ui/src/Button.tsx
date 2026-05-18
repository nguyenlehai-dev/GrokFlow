import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
}

const styles: Record<ButtonVariant, React.CSSProperties> = {
  primary:   { background: "var(--gf-primary)",     color: "var(--gf-primary-fg)", border: "none" },
  secondary: { background: "var(--gf-bg)",          color: "var(--gf-fg)",         border: "1px solid var(--gf-border)" },
  ghost:     { background: "transparent",           color: "var(--gf-fg)",         border: "none" },
  danger:    { background: "var(--gf-danger)",      color: "#fff",                 border: "none" },
};

/** Themed button. Picks colours from CSS variables so a single component
 *  set works across all modules + reacts to the theme postMessage from
 *  core. The size scale is fixed (one size = consistent admin shell);
 *  if a module truly needs a different size, override via className. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", loading, icon, disabled, children, style, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        style={{
          ...styles[variant],
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.4rem",
          padding: "0.5rem 0.9rem",
          borderRadius: "var(--gf-radius)",
          fontWeight: 500,
          cursor: disabled || loading ? "not-allowed" : "pointer",
          opacity: disabled || loading ? 0.6 : 1,
          fontFamily: "inherit",
          fontSize: "0.875rem",
          transition: "background 120ms, opacity 120ms",
          ...style,
        }}
        {...rest}
      >
        {icon}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
