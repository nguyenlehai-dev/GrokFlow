/** FlowShell — the dark workspace chrome wrapping every /flow/* page.
 *
 *  Layout (matches the design mock):
 *
 *      ┌─ outer container ───────────────────────────────────────────┐
 *      │ ┌─ aside ──┐  ┌─ section workspace ───────────────────────┐ │
 *      │ │ System   │  │ CURRENT WORKSPACE                          │ │
 *      │ │ Auth     │  │ <Tool Name h1>                             │ │
 *      │ │          │  ├────────────────────────────────────────────┤ │
 *      │ │ Toolbox  │  │ <children: drop zones, op syntax, button> │ │
 *      │ │          │  │                                            │ │
 *      │ └──────────┘  └────────────────────────────────────────────┘ │
 *      └─────────────────────────────────────────────────────────────┘
 *
 *  We deliberately don't try to replace GrokFlow's outer chrome —
 *  the global sidebar still owns navigation across modules; the inner
 *  Toolbox is just a per-module shortcut list.
 */
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { KeyRound, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { TOOLS } from "../tools";
import { getHealth } from "../api";

/** Cosmetic API-key field. Real auth is GrokFlow's JWT (injected by the
 *  axios interceptor); this lets users verify the backend can reach the
 *  flow-api side-car and optionally stash an override key for direct API
 *  callers. Stored to localStorage so a reload doesn't wipe it. */
function SystemAuthCard() {
  const [key, setKey] = useState(() => localStorage.getItem("flow.apiKey") ?? "");
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "down">("idle");

  const verify = async () => {
    setVerifying(true);
    setStatus("idle");
    try {
      const r = await getHealth();
      const ok = r.status === "healthy" || r.status === "ok";
      setStatus(ok ? "ok" : "down");
      if (ok) {
        localStorage.setItem("flow.apiKey", key);
        toast("Service healthy", "success");
      } else {
        toast("Service down", "error");
      }
    } catch {
      setStatus("down");
      toast("Service unreachable", "error");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-black/10">
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-violet-400" />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">
          System Auth
        </span>
      </div>
      <div className="flex gap-2">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste your API Key"
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <button
          type="button"
          onClick={verify}
          disabled={verifying}
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
        >
          {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Xác minh"}
        </button>
      </div>
      {status === "ok" && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400">
          <CheckCircle2 className="h-3 w-3" /> Service healthy
        </p>
      )}
      {status === "down" && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-rose-400">
          <AlertCircle className="h-3 w-3" /> Service unreachable
        </p>
      )}
    </div>
  );
}

function ToolboxCard() {
  const { pathname } = useLocation();
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-black/10">
      <p className="mb-3 text-sm font-semibold text-slate-100">Toolbox</p>
      <nav className="space-y-1">
        {TOOLS.map((t) => {
          const active = pathname === `/flow/${t.slug}`;
          const Icon = t.icon;
          return (
            <Link
              key={t.slug}
              to={`/flow/${t.slug}`}
              className={[
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                active
                  ? "border-violet-500/60 bg-violet-600/10 ring-1 ring-violet-500/40"
                  : "border-transparent hover:border-slate-700 hover:bg-slate-800/60",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  active ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span
                  className={[
                    "block truncate text-sm font-semibold",
                    active ? "text-white" : "text-slate-200",
                  ].join(" ")}
                >
                  {t.shortLabel}
                </span>
                <span className="block truncate text-[11px] text-slate-500">{t.tagline}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

interface ShellProps {
  workspaceLabel: string;
  children: React.ReactNode;
}

export function FlowShell({ workspaceLabel, children }: ShellProps) {
  return (
    <div className="min-h-full bg-gradient-to-b from-[#0a0e1f] via-[#0b1024] to-[#0a0e1f]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <SystemAuthCard />
          <ToolboxCard />
        </aside>

        <section className="space-y-4">
          <header className="rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4 shadow-lg shadow-black/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-400">
              Current Workspace
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-white">{workspaceLabel}</h1>
          </header>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-black/10 sm:p-6">
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
