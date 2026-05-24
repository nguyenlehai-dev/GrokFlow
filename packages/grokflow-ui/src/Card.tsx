import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: ReactNode;
  actions?: ReactNode;
}

export function Card({ title, actions, children, style, ...rest }: CardProps) {
  return (
    <div
      style={{
        background: "var(--gf-bg)",
        border: "1px solid var(--gf-border)",
        borderRadius: "var(--gf-radius)",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      {(title || actions) && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--gf-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontWeight: 600,
          }}
        >
          <div>{title}</div>
          <div>{actions}</div>
        </div>
      )}
      <div style={{ padding: "1rem" }}>{children}</div>
    </div>
  );
}
