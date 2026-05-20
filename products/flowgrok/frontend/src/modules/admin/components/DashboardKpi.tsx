import type { Period } from "../models/dashboard";

export const PERIOD_LABEL: Record<Period, string> = {
  all: "Tất cả",
  today: "Hôm nay",
  week: "Tuần",
  month: "Tháng",
};

export function DashboardKpi({ label, value, sub, accent }: {
  label: string; value: number | string; sub?: string; accent?: string;
}) {
  return (
    <div className="card-hover">
      <div className="stat-label">{label}</div>
      <div className={`mt-2 text-3xl font-bold tracking-tight ${accent ?? "text-slate-900"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-9000 mt-1.5">{sub}</div>}
    </div>
  );
}

export function DashboardScopeBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
        active
          ? "bg-gradient-brand text-white shadow-brand"
          : "text-slate-300 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

export function DashboardPeriodTabs({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-card">
      {(["all", "today", "week", "month"] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
            value === p
              ? "bg-gradient-brand text-white shadow-brand"
              : "text-slate-300 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          {PERIOD_LABEL[p]}
        </button>
      ))}
    </div>
  );
}
