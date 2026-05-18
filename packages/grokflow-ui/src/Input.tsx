import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid, style, ...rest }, ref) => (
    <input
      ref={ref}
      style={{
        width: "100%",
        padding: "0.5rem 0.75rem",
        border: `1px solid ${invalid ? "var(--gf-danger)" : "var(--gf-border)"}`,
        borderRadius: "var(--gf-radius)",
        background: "var(--gf-bg)",
        color: "var(--gf-fg)",
        fontFamily: "inherit",
        fontSize: "0.875rem",
        outline: "none",
        ...style,
      }}
      {...rest}
    />
  ),
);

Input.displayName = "Input";
