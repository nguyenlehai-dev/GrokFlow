import type { ReactNode } from "react";

/** Wrapper that applies the "GROK VIP TOOL" dark-purple aesthetic to
 *  every Tool sub-page. Stays inside the existing AppShell — we just
 *  paint a dark gradient over the main column + scope a few utility
 *  classes (.tool-card, .tool-accent) that pages compose with Tailwind. */
export function ToolShell({
  title, subtitle, action, children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="tool-skin -m-4 sm:-m-5 md:-m-7 min-h-[calc(100vh-3.5rem)] p-4 sm:p-6 md:p-8">
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-violet-200/70 mt-1">{subtitle}</p>
          )}
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}
