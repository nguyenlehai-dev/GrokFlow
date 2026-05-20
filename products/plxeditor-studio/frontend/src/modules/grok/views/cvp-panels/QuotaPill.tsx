import { Zap } from "lucide-react";

import { useDomainQuota } from "./hooks";

/** Topbar badge showing `<used>/<limit>` for the current UTC day.
 *
 *  Colors:
 *    • cyan/teal  — under 70 % used (plenty of slots)
 *    • amber      — 70 – 90 % used (heads up)
 *    • rose/red   — ≥ 90 % used or quota fully exhausted
 *    • slate dim  — unlimited domain (still shows raw count of today)
 *
 *  Hidden entirely when the quota API errors (e.g. backend down) so the
 *  topbar doesn't render a broken widget — the rest of the tool keeps
 *  working. Hover-tooltip shows reset time + raw counts. */
export function QuotaPill() {
  const { data, isLoading, isError } = useDomainQuota();

  if (isError) return null;
  if (isLoading || !data) {
    return (
      <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 ring-1 ring-white/10 text-[11px] text-slate-500">
        <Zap size={11} className="opacity-50" /> …
      </div>
    );
  }

  if (data.unlimited) {
    const resetTime = new Date(data.period_end).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit",
    });
    return (
      <div
        className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 ring-1 ring-cyan-500/15 text-[11px] text-slate-300 hover:text-cyan-200 transition-colors"
        title={`Unlimited • ${data.used} jobs hôm nay • reset ${resetTime}`}
      >
        <Zap size={11} className="text-cyan-300/70" />
        <span className="font-mono">{data.used}</span>
        <span className="text-slate-500">/ ∞</span>
      </div>
    );
  }

  const used = data.used;
  const limit = data.limit ?? 0;
  const pct = limit > 0 ? (used / limit) * 100 : 0;

  // Color tier — match the user-mentioned thresholds (<70 ok, 70–90 warn, ≥90 danger).
  let cls = "ring-cyan-500/20 text-cyan-200";
  let icon = "text-cyan-300/80";
  let pulse = "";
  if (pct >= 100) {
    cls = "ring-rose-400/40 text-rose-200 bg-rose-500/10";
    icon = "text-rose-300";
    pulse = "animate-pulse";
  } else if (pct >= 90) {
    cls = "ring-rose-400/30 text-rose-200";
    icon = "text-rose-300";
    pulse = "animate-pulse";
  } else if (pct >= 70) {
    cls = "ring-amber-400/30 text-amber-200";
    icon = "text-amber-300";
  }

  const resetTime = new Date(data.period_end).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit",
  });
  const scopeLabel = data.scope === "tool_install" ? " (gói máy này)"
    : data.scope === "domain" ? " (gói tenant)" : "";
  const tooltip =
    `${used}/${limit} jobs hôm nay${scopeLabel} · ${data.remaining ?? 0} còn lại · reset lúc ${resetTime}`
    + (pct >= 90 ? " • Liên hệ admin để tăng gói." : "");

  return (
    <div
      className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 ring-1 ${cls} ${pulse} text-[11px] transition-colors`}
      title={tooltip}
    >
      <Zap size={11} className={icon} />
      <span className="font-mono font-bold">{used}</span>
      <span className="opacity-60">/</span>
      <span className="font-mono opacity-80">{limit}</span>
      <span className="hidden md:inline text-slate-400 ml-1">hôm nay</span>
    </div>
  );
}
