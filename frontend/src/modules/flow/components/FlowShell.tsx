/** FlowShell — workspace chrome shared by every /flow/* page.
 *  Light theme to match the rest of GrokFlow; the only "Flow-specific"
 *  accent we keep is the violet ignite button (lives in VideoToolPage).
 */

interface ShellProps {
  workspaceLabel: string;
  children: React.ReactNode;
}

export function FlowShell({ workspaceLabel, children }: ShellProps) {
  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">
            Current Workspace
          </p>
          <h1 className="mt-1 page-title">{workspaceLabel}</h1>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
