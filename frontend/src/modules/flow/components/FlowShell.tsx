/** FlowShell — dark workspace chrome shared by every /flow/* page.
 *
 *  Layout:
 *      ┌─ Current Workspace header ────┐
 *      │ <Tool Name h1>                │
 *      ├───────────────────────────────┤
 *      │ <children: drop, syntax, btn> │
 *      └───────────────────────────────┘
 *
 *  We dropped the in-page System Auth + Toolbox cards because the outer
 *  GrokFlow sidebar already lists the same 8 tools — having two nav
 *  surfaces was duplicating clicks. Auth piggybacks on the GrokFlow JWT
 *  the user signed in with, so the cosmetic "Paste API Key" panel was
 *  dead weight too.
 */

interface ShellProps {
  workspaceLabel: string;
  children: React.ReactNode;
}

export function FlowShell({ workspaceLabel, children }: ShellProps) {
  return (
    <div className="min-h-full bg-gradient-to-b from-[#0a0e1f] via-[#0b1024] to-[#0a0e1f]">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4 shadow-lg shadow-black/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-400">
            Current Workspace
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white">{workspaceLabel}</h1>
        </header>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-black/10 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
