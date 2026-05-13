import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, Video, Sparkles, TrendingUp, Globe, ChevronUp, ChevronDown, Scissors, Cpu } from "lucide-react";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";

type Period = "all" | "today" | "week" | "month";

interface AppItem { name: string; count: number; }
interface AppGroup {
  code: "image" | "video" | "flow" | "gateway" | "mini_app";
  label: string;
  items: AppItem[];
  total: number;
}
interface RevenuePoint { month: string; amount: number; }
interface JobTimePoint { day: string; count: number; }
interface DomainStats {
  domain_id: string | null;
  hostname: string | null;
  users: number;
  jobs_total: number;
  jobs_image: number;
  jobs_video: number;
  jobs_failed: number;
  jobs_success: number;
  profiles: number;
  api_keys: number;
  revenue: number;
  last_activity: string | null;
}
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
  per_domain: DomainStats[];
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
  const isSuper = me?.role === "super_admin";
  const [period, setPeriod] = useState<Period>("all");
  const [scope, setScope] = useState<"me" | "admin">(isAdmin ? "admin" : "me");
  // App-stats domain filter. Only super_admin can switch — per-domain admin
  // is force-scoped server-side, but we still display their domain name so
  // it's clear what they're looking at.
  const [appDomain, setAppDomain] = useState<string>("");

  // Domains list for the picker — same query the AuditLogPage uses, cached.
  const { data: domains } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: async () => (await api.get<{ id: string; hostname: string }[]>("/api/admin/domains")).data,
    enabled: isSuper,
  });

  const endpoint = scope === "admin" ? "/api/dashboard/admin" : "/api/dashboard/me";
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", scope, period, appDomain],
    queryFn: async () => {
      const params: Record<string, string> = { period };
      if (scope === "admin" && appDomain) params.domain_id = appDomain;
      return (await api.get<DashboardData>(endpoint, { params })).data;
    },
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

          {/* Per-domain breakdown — admin scope only, shows nothing on /me */}
          {scope === "admin" && data.per_domain && data.per_domain.length > 0 && (
            <PerDomainSection rows={data.per_domain} period={period} />
          )}

          {/* App stats — Grok / Flow / Gateway / Mini-Apps, filterable by domain */}
          <AppStatsSection
            groups={data.app_groups}
            period={period}
            onPeriod={setPeriod}
            domains={domains ?? []}
            selectedDomain={appDomain}
            onSelectDomain={setAppDomain}
            showDomainPicker={isSuper && scope === "admin"}
          />
        </>
      ) : null}
    </div>
  );
}

// ============================================================================
// Per-domain breakdown table
// ============================================================================

type SortKey = "jobs_total" | "jobs_image" | "jobs_video" | "jobs_failed"
  | "users" | "profiles" | "api_keys" | "revenue" | "last_activity";

function PerDomainSection({ rows, period }: { rows: DomainStats[]; period: Period }) {
  const [sortKey, setSortKey] = useState<SortKey>("jobs_total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const sorted = [...rows]
    .filter((r) => !search || (r.hostname ?? "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      // `last_activity` strings sort lexicographically by ISO — same as time.
      const av = (a[sortKey] ?? 0) as number | string;
      const bv = (b[sortKey] ?? 0) as number | string;
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  // Totals row for the footer — adds up everything visible.
  const totals = sorted.reduce(
    (acc, r) => ({
      users: acc.users + r.users,
      jobs_total: acc.jobs_total + r.jobs_total,
      jobs_image: acc.jobs_image + r.jobs_image,
      jobs_video: acc.jobs_video + r.jobs_video,
      jobs_failed: acc.jobs_failed + r.jobs_failed,
      profiles: acc.profiles + r.profiles,
      api_keys: acc.api_keys + r.api_keys,
      revenue: acc.revenue + r.revenue,
    }),
    { users: 0, jobs_total: 0, jobs_image: 0, jobs_video: 0,
      jobs_failed: 0, profiles: 0, api_keys: 0, revenue: 0 },
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-violet-600" />
          <h2 className="font-semibold">Thống kê theo Domain</h2>
          <span className="text-xs text-slate-500">
            ({PERIOD_LABEL[period].toLowerCase()})
          </span>
        </div>
        <input
          className="input w-56 text-sm"
          placeholder="Tìm domain..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Domain</th>
              <SortHeader k="users" sk={sortKey} sd={sortDir} onClick={toggleSort}>Users</SortHeader>
              <SortHeader k="jobs_total" sk={sortKey} sd={sortDir} onClick={toggleSort}>Jobs</SortHeader>
              <SortHeader k="jobs_image" sk={sortKey} sd={sortDir} onClick={toggleSort}>Ảnh</SortHeader>
              <SortHeader k="jobs_video" sk={sortKey} sd={sortDir} onClick={toggleSort}>Video</SortHeader>
              <SortHeader k="jobs_failed" sk={sortKey} sd={sortDir} onClick={toggleSort}>Lỗi</SortHeader>
              <SortHeader k="profiles" sk={sortKey} sd={sortDir} onClick={toggleSort}>Profile</SortHeader>
              <SortHeader k="api_keys" sk={sortKey} sd={sortDir} onClick={toggleSort}>API Key</SortHeader>
              <SortHeader k="revenue" sk={sortKey} sd={sortDir} onClick={toggleSort}>Doanh thu</SortHeader>
              <SortHeader k="last_activity" sk={sortKey} sd={sortDir} onClick={toggleSort}>Hoạt động cuối</SortHeader>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  Chưa có domain nào khớp.
                </td>
              </tr>
            ) : (
              sorted.map((r) => {
                const successRate = r.jobs_total > 0
                  ? Math.round((r.jobs_success / r.jobs_total) * 100)
                  : null;
                return (
                  <tr key={r.domain_id ?? "no-domain"} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2">
                      {r.hostname ? (
                        <span className="font-medium text-slate-700">{r.hostname}</span>
                      ) : (
                        <span className="text-slate-400 italic">(không có domain)</span>
                      )}
                      {successRate !== null && (
                        <span
                          className={`ml-2 text-[10px] font-mono ${
                            successRate >= 90 ? "text-emerald-600"
                            : successRate >= 70 ? "text-amber-600"
                            : "text-rose-600"
                          }`}
                          title="Tỷ lệ job thành công"
                        >
                          {successRate}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{fmt(r.users)}</td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">
                      {fmt(r.jobs_total)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-cyan-700">{fmt(r.jobs_image)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-rose-700">{fmt(r.jobs_video)}</td>
                    <td className={`px-3 py-2 font-mono text-xs ${r.jobs_failed > 0 ? "text-rose-600" : "text-slate-400"}`}>
                      {fmt(r.jobs_failed)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{fmt(r.profiles)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{fmt(r.api_keys)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-emerald-700">
                      {r.revenue > 0 ? fmtVnd(r.revenue) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {r.last_activity ? new Date(r.last_activity).toLocaleString("vi-VN") : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {sorted.length > 1 && (
            <tfoot className="bg-slate-50 font-semibold">
              <tr className="border-t">
                <td className="px-3 py-2 text-xs uppercase text-slate-500">
                  Tổng ({sorted.length} domain)
                </td>
                <td className="px-3 py-2 font-mono text-xs">{fmt(totals.users)}</td>
                <td className="px-3 py-2 font-mono text-xs">{fmt(totals.jobs_total)}</td>
                <td className="px-3 py-2 font-mono text-xs text-cyan-700">{fmt(totals.jobs_image)}</td>
                <td className="px-3 py-2 font-mono text-xs text-rose-700">{fmt(totals.jobs_video)}</td>
                <td className={`px-3 py-2 font-mono text-xs ${totals.jobs_failed > 0 ? "text-rose-600" : ""}`}>
                  {fmt(totals.jobs_failed)}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{fmt(totals.profiles)}</td>
                <td className="px-3 py-2 font-mono text-xs">{fmt(totals.api_keys)}</td>
                <td className="px-3 py-2 font-mono text-xs text-emerald-700">
                  {totals.revenue > 0 ? fmtVnd(totals.revenue) : "—"}
                </td>
                <td className="px-3 py-2"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  k, sk, sd, onClick, children,
}: {
  k: SortKey;
  sk: SortKey;
  sd: "asc" | "desc";
  onClick: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = sk === k;
  return (
    <th
      className="px-3 py-2 cursor-pointer select-none whitespace-nowrap hover:bg-slate-100"
      onClick={() => onClick(k)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (sd === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
      </span>
    </th>
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

interface AppStatsProps {
  groups: AppGroup[];
  period: Period;
  onPeriod: (p: Period) => void;
  domains: { id: string; hostname: string }[];
  selectedDomain: string;
  onSelectDomain: (id: string) => void;
  showDomainPicker: boolean;
}

function AppStatsSection({
  groups, period, onPeriod, domains, selectedDomain, onSelectDomain, showDomainPicker,
}: AppStatsProps) {
  // Hide empty groups so a tenant with no Flow/Gateway usage doesn't
  // see two ghost columns. Always show at least the first 3 to preserve
  // layout intent when the dashboard is empty (post-deploy / new tenant).
  const visible = groups.filter((g, i) => i < 3 || g.total > 0);
  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="font-semibold">Thống kê theo App</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Phân loại {fmt(grandTotal)} job/request theo nguồn — Grok ảnh, Grok video, Flow video tools, Gateway LLM, API keys.
            {selectedDomain && domains.length > 0 && (
              <>  Đang lọc theo <strong>{domains.find((d) => d.id === selectedDomain)?.hostname ?? "?"}</strong>.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showDomainPicker && (
            <select
              className="input text-sm"
              value={selectedDomain}
              onChange={(e) => onSelectDomain(e.target.value)}
            >
              <option value="">Tất cả domain</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>{d.hostname}</option>
              ))}
            </select>
          )}
          <PeriodTabs value={period} onChange={onPeriod} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {visible.map((g) => (
          <AppGroupCard key={g.code} group={g} grandTotal={grandTotal} />
        ))}
      </div>
    </div>
  );
}

const APP_VISUAL: Record<AppGroup["code"], { icon: typeof ImageIcon; accent: string; bg: string }> = {
  image:    { icon: ImageIcon, accent: "text-cyan-700",    bg: "bg-cyan-50" },
  video:    { icon: Video,     accent: "text-rose-700",    bg: "bg-rose-50" },
  flow:     { icon: Scissors,  accent: "text-violet-700",  bg: "bg-violet-50" },
  gateway:  { icon: Cpu,       accent: "text-indigo-700",  bg: "bg-indigo-50" },
  mini_app: { icon: Sparkles,  accent: "text-amber-700",   bg: "bg-amber-50" },
};

function AppGroupCard({ group, grandTotal }: { group: AppGroup; grandTotal: number }) {
  const visual = APP_VISUAL[group.code];
  const Icon = visual.icon;
  const sharePct = grandTotal > 0 ? Math.round((group.total / grandTotal) * 100) : 0;
  // Show top-bar share of total ONLY for non-trivial groups so the eye is
  // drawn to material contributions, not a single rogue test job.

  const maxInGroup = group.items.length > 0
    ? Math.max(...group.items.map((i) => i.count))
    : 1;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col">
      <div className={`px-3 py-2 ${visual.bg} border-b border-slate-200`}>
        <div className="flex items-center justify-between">
          <h3 className={`font-semibold flex items-center gap-2 text-sm ${visual.accent}`}>
            <Icon size={16} /> {group.label}
          </h3>
          <span className={`text-xs font-mono font-semibold ${visual.accent}`}>
            {fmt(group.total)}
            {grandTotal > 0 && (
              <span className="ml-1 text-[10px] font-normal opacity-70">
                ({sharePct}%)
              </span>
            )}
          </span>
        </div>
      </div>
      {group.items.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-slate-400">Chưa có dữ liệu.</p>
      ) : (
        <div className="divide-y divide-slate-100 flex-1">
          {group.items.slice(0, 12).map((item) => {
            // Bar shows the item's count relative to the largest in its group.
            // Helps eye-spot the dominant model/operation per category.
            const barPct = (item.count / maxInGroup) * 100;
            return (
              <div
                key={item.name}
                className="px-3 py-2 hover:bg-slate-50 transition text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-700 min-w-0">{item.name}</span>
                  <span className={`font-mono font-semibold flex-shrink-0 ${visual.accent}`}>
                    {fmt(item.count)}
                  </span>
                </div>
                <div className="mt-1 h-1 w-full bg-slate-100 rounded overflow-hidden">
                  <div
                    className={`h-full ${visual.bg} ${visual.accent}`}
                    style={{
                      width: `${barPct}%`,
                      backgroundColor: "currentColor",
                      opacity: 0.5,
                    }}
                  />
                </div>
              </div>
            );
          })}
          {group.items.length > 12 && (
            <div className="px-3 py-2 text-xs text-slate-500 text-center">
              +{group.items.length - 12} mục khác
            </div>
          )}
        </div>
      )}
    </div>
  );
}
