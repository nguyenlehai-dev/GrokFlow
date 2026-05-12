import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, Video, Sparkles, TrendingUp } from "lucide-react";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";

type Period = "all" | "today" | "week" | "month";

interface AppItem { name: string; count: number; }
interface AppGroup { code: "image" | "video" | "mini_app"; label: string; items: AppItem[]; }
interface RevenuePoint { month: string; amount: number; }
interface JobTimePoint { day: string; count: number; }
interface DashboardData {
  period: Period;
  scope: "me" | "admin";
  totals: {
    jobs_total: number;
    jobs_today: number;
    jobs_success: number;
    jobs_failed: number;
    jobs_queued: number;
    jobs_running: number;
    profiles: number;
    profiles_logged_in: number;
    profiles_need_login: number;
    slots_total: number;
    slots_used: number;
    api_keys: number;
    users: number;
    revenue_total: number;
  };
  app_groups: AppGroup[];
  revenue: RevenuePoint[];
  jobs_timeseries: JobTimePoint[];
}

const PERIOD_LABEL: Record<Period, string> = {
  all: "Tất cả",
  today: "Hôm nay",
  week: "Tuần",
  month: "Tháng",
};

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
const fmtVnd = (n: number) => fmt(Math.round(n)) + "₫";

export function DashboardPage() {
  const me = useAuthStore((s) => s.user);
  const isAdmin = (me?.role === "admin" || me?.role === "super_admin");
  const [period, setPeriod] = useState<Period>("all");
  const [scope, setScope] = useState<"me" | "admin">(isAdmin ? "admin" : "me");

  const endpoint = scope === "admin" ? "/api/dashboard/admin" : "/api/dashboard/me";
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", scope, period],
    queryFn: async () => (await api.get<DashboardData>(`${endpoint}?period=${period}`)).data,
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Auto-refresh mỗi 15s · {scope === "admin" ? "Toàn hệ thống" : "Của bạn"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 mr-2">
              <ScopeBtn active={scope === "admin"} onClick={() => setScope("admin")}>System</ScopeBtn>
              <ScopeBtn active={scope === "me"} onClick={() => setScope("me")}>Của tôi</ScopeBtn>
            </div>
          )}
          <PeriodTabs value={period} onChange={setPeriod} />
        </div>
      </div>

      {isLoading && !data ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : error && !data ? (
        <div className="card text-rose-600 text-sm">
          Không tải được dashboard: {(error as any)?.message ?? "lỗi"}
        </div>
      ) : data ? (
        <>
          {/* Top KPI row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Tổng job" value={fmt(data.totals.jobs_total)}
              sub={`${fmt(data.totals.jobs_today)} trong 24h`} />
            <Kpi label="Thành công" value={fmt(data.totals.jobs_success)}
              accent="text-emerald-600" />
            <Kpi label="Lỗi" value={fmt(data.totals.jobs_failed)}
              accent={data.totals.jobs_failed > 0 ? "text-rose-600" : ""} />
            <Kpi
              label="Slot pool"
              value={`${data.totals.slots_used}/${data.totals.slots_total}`}
              sub={`${data.totals.profiles_logged_in} profile sẵn sàng`}
              accent={
                data.totals.slots_total > 0 &&
                  data.totals.slots_used / data.totals.slots_total >= 1
                  ? "text-rose-600"
                  : data.totals.slots_total > 0 &&
                    data.totals.slots_used / data.totals.slots_total >= 0.7
                  ? "text-amber-600"
                  : "text-emerald-600"
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Đang chờ" value={fmt(data.totals.jobs_queued)} accent="text-blue-600" />
            <Kpi label="Đang chạy" value={fmt(data.totals.jobs_running)} accent="text-amber-600" />
            <Kpi
              label="Profile need_login"
              value={fmt(data.totals.profiles_need_login)}
              accent={data.totals.profiles_need_login > 0 ? "text-rose-600" : ""}
            />
            {scope === "admin" ? (
              <Kpi label="Users" value={fmt(data.totals.users)} />
            ) : (
              <Kpi label="API Keys" value={fmt(data.totals.api_keys)} />
            )}
          </div>

          {/* Revenue chart + jobs timeseries */}
          <div className="grid gap-4 lg:grid-cols-2">
            <RevenueCard data={data.revenue} total={data.totals.revenue_total} />
            <JobsTimeseriesCard data={data.jobs_timeseries} />
          </div>

          {/* App stats — 3 columns like reference design */}
          <AppStatsSection groups={data.app_groups} period={period} onPeriod={setPeriod} />
        </>
      ) : null}
    </div>
  );
}

// ============================================================================
// KPI card
// ============================================================================

function Kpi({ label, value, sub, accent }: {
  label: string; value: number | string; sub?: string; accent?: string;
}) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accent ?? "text-slate-900"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function ScopeBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded transition ${
        active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function PeriodTabs({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
      {(["all", "today", "week", "month"] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1.5 text-xs rounded transition ${
            value === p ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {PERIOD_LABEL[p]}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Revenue line chart (last 12 months) — pure SVG, no library
// ============================================================================

function RevenueCard({ data, total }: { data: RevenuePoint[]; total: number }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" /> Doanh thu 12 tháng
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Tổng đã thu: {fmtVnd(total)}</p>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-400">
          Chưa có thanh toán nào.
        </div>
      ) : (
        <LineChart data={data} />
      )}
    </div>
  );
}

function LineChart({ data }: { data: RevenuePoint[] }) {
  const W = 600, H = 160, PAD = 24;
  const max = Math.max(...data.map((d) => d.amount), 1);
  const min = 0;
  const xStep = (W - PAD * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const x = PAD + i * xStep;
    const y = H - PAD - ((d.amount - min) / (max - min)) * (H - PAD * 2);
    return { x, y, ...d };
  });
  const path = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  const area = `${path} L ${points[points.length - 1].x} ${H - PAD} L ${PAD} ${H - PAD} Z`;

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40">
        <defs>
          <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#rev-grad)" />
        <path d={path} fill="none" stroke="#10b981" strokeWidth="2" />
        {points.map((p) => (
          <g key={p.month}>
            <circle cx={p.x} cy={p.y} r="3" fill="#10b981" />
            <title>{p.month}: {fmtVnd(p.amount)}</title>
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 font-mono px-2">
        {points.length > 0 && (
          <>
            <span>{points[0].month}</span>
            {points.length > 2 && <span>{points[Math.floor(points.length / 2)].month}</span>}
            <span>{points[points.length - 1].month}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Jobs timeseries (last 30 days) — bar chart
// ============================================================================

function JobsTimeseriesCard({ data }: { data: JobTimePoint[] }) {
  return (
    <div className="card">
      <h3 className="font-semibold">Jobs 30 ngày gần nhất</h3>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-400">
          Chưa có job.
        </div>
      ) : (
        <BarChart data={data} />
      )}
    </div>
  );
}

function BarChart({ data }: { data: JobTimePoint[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-1 mt-3">
      <div className="flex items-end gap-1 h-32">
        {data.map((d) => {
          const h = (d.count / max) * 100;
          return (
            <div
              key={d.day}
              className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition relative group"
              style={{ height: `${h}%`, minHeight: "1px" }}
              title={`${d.day}: ${fmt(d.count)} jobs`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 font-mono">
        <span>{data[0]?.day}</span>
        <span>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  );
}

// ============================================================================
// App stats section — 3 columns
// ============================================================================

function AppStatsSection({ groups, period, onPeriod }: {
  groups: AppGroup[]; period: Period; onPeriod: (p: Period) => void;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Thống kê theo App</h2>
        <PeriodTabs value={period} onChange={onPeriod} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {groups.map((g) => (
          <AppGroupCard key={g.code} group={g} />
        ))}
      </div>
    </div>
  );
}

function AppGroupCard({ group }: { group: AppGroup }) {
  const Icon =
    group.code === "image" ? ImageIcon : group.code === "video" ? Video : Sparkles;
  const accentText =
    group.code === "image" ? "text-cyan-700"
    : group.code === "video" ? "text-rose-700"
    : "text-amber-700";

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
        <h3 className={`font-semibold flex items-center gap-2 text-sm ${accentText}`}>
          <Icon size={16} /> {group.label}
        </h3>
      </div>
      {group.items.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-slate-400">Chưa có dữ liệu.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {group.items.slice(0, 15).map((item) => (
            <div
              key={item.name}
              className="px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition text-sm"
            >
              <span className="truncate text-slate-700">{item.name}</span>
              <span className={`font-mono font-semibold ${accentText}`}>
                {fmt(item.count)}
              </span>
            </div>
          ))}
          {group.items.length > 15 && (
            <div className="px-3 py-2 text-xs text-slate-500 text-center">
              +{group.items.length - 15} app khác
            </div>
          )}
        </div>
      )}
    </div>
  );
}
