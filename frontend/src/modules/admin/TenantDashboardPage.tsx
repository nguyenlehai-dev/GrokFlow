import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Image as ImageIcon, Video, Layers, Workflow, Activity,
  FileText, Key, ScrollText, Settings, KeyRound, Scissors, Cpu,
  CheckCircle2, AlertCircle, Clock, ArrowRight,
} from "lucide-react";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import { StatusBadge } from "@/components/ui/StatusBadge";

/** Tenant-facing dashboard. Distinct from the super_admin DashboardPage:
 *  - Brand greeting + hostname pill (uses domain.brand_name / label).
 *  - Quick-actions filtered by domain.allowed_pages so each tenant only
 *    sees their relevant modules (Profiles/Jobs/Playground for Groks,
 *    Gateway suite for Gateways, Flow tools for Video).
 *  - Stats are tenant-scoped server-side via /api/dashboard/me.
 *  - Recent jobs widget below.
 *  Super_admin still gets the original system-wide DashboardPage via
 *  DashboardSwitch.
 */

type Period = "all" | "today" | "week" | "month";

interface DashboardData {
  totals: {
    jobs_total: number;
    jobs_today: number;
    jobs_success: number;
    jobs_failed: number;
    jobs_queued: number;
    jobs_running: number;
    profiles: number;
    profiles_logged_in: number;
    slots_total: number;
    slots_used: number;
    api_keys: number;
  };
}

interface JobLite {
  id: string;
  status: string;
  job_type: string;
  prompt: string;
  created_at: string;
}

const PERIODS: { v: Period; label: string }[] = [
  { v: "today", label: "Hôm nay" },
  { v: "week", label: "Tuần" },
  { v: "month", label: "Tháng" },
  { v: "all", label: "Tất cả" },
];

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

export function TenantDashboardPage() {
  const me = useAuthStore((s) => s.user);
  const domain = useDomainStore((s) => s.config);
  const [period, setPeriod] = useState<Period>("today");

  const { data, isLoading } = useQuery({
    queryKey: ["tenant-dashboard", period],
    queryFn: async () =>
      (await api.get<DashboardData>("/api/dashboard/me", { params: { period } })).data,
    refetchInterval: 30_000,
  });

  // Last 5 jobs — tenant-scoped because /api/jobs filters by user_id
  // and tenant admins fall back to their domain users via backend logic.
  const { data: recentJobs } = useQuery({
    queryKey: ["tenant-dashboard-recent-jobs"],
    queryFn: async () =>
      (await api.get<JobLite[]>("/api/jobs", { params: { limit: 5 } })).data,
    refetchInterval: 15_000,
  });

  const brand = domain?.brand_name || domain?.label || "Dashboard";
  const greeting = greetByTime();

  return (
    <div className="space-y-6">
      {/* Brand greeting header */}
      <div className="rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white p-6 shadow">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80">{greeting}</p>
            <h1 className="text-2xl font-bold mt-0.5">{brand}</h1>
            <p className="text-sm opacity-90 mt-1">
              {me?.email}
              {domain?.hostname && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs font-mono">
                  {domain.hostname}
                </span>
              )}
            </p>
          </div>
          <PeriodTabs value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* KPIs */}
      {isLoading && !data ? (
        <p className="text-slate-500">Đang tải…</p>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Tổng job"
            value={fmt(data.totals.jobs_total)}
            sub={`${fmt(data.totals.jobs_today)} trong 24h`}
            icon={Workflow}
            tone="violet"
          />
          <Kpi
            label="Thành công"
            value={fmt(data.totals.jobs_success)}
            sub={successRateLabel(data.totals.jobs_success, data.totals.jobs_total)}
            icon={CheckCircle2}
            tone="emerald"
          />
          <Kpi
            label="Đang xử lý"
            value={fmt(data.totals.jobs_queued + data.totals.jobs_running)}
            sub={`${fmt(data.totals.jobs_running)} đang chạy`}
            icon={Clock}
            tone="amber"
          />
          <Kpi
            label="Lỗi"
            value={fmt(data.totals.jobs_failed)}
            sub={data.totals.jobs_failed > 0 ? "Cần kiểm tra" : "Sạch lỗi"}
            icon={AlertCircle}
            tone={data.totals.jobs_failed > 0 ? "rose" : "emerald"}
          />
        </div>
      ) : null}

      {/* Quick actions — filtered by allowed_pages so each tenant sees
          only their modules */}
      <QuickActions allowed={domain?.allowed_pages ?? []} />

      {/* Recent activity + secondary stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentJobs jobs={recentJobs ?? []} />
        </div>
        <SecondaryStats data={data} />
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function PeriodTabs({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  return (
    <div className="inline-flex rounded-md bg-white/15 p-0.5">
      {PERIODS.map((p) => (
        <button
          key={p.v}
          onClick={() => onChange(p.v)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition ${
            value === p.v ? "bg-white text-violet-700" : "text-white/90 hover:bg-white/10"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

const TONE_CLS: Record<string, { ring: string; icon: string; value: string }> = {
  violet:  { ring: "ring-violet-100",  icon: "text-violet-500",  value: "text-slate-900" },
  emerald: { ring: "ring-emerald-100", icon: "text-emerald-500", value: "text-emerald-600" },
  amber:   { ring: "ring-amber-100",   icon: "text-amber-500",   value: "text-amber-600" },
  rose:    { ring: "ring-rose-100",    icon: "text-rose-500",    value: "text-rose-600" },
};

function Kpi({
  label, value, sub, icon: Icon, tone = "violet",
}: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<any>;
  tone?: keyof typeof TONE_CLS;
}) {
  const t = TONE_CLS[tone];
  return (
    <div className={`rounded-lg bg-white p-4 ring-1 ${t.ring} shadow-sm`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        <Icon size={18} className={t.icon} />
      </div>
      <p className={`text-2xl font-bold mt-2 ${t.value}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// Map a path → which card to show. We render only paths the domain allows.
const QUICK_CARDS: {
  path: string;
  label: string;
  desc: string;
  icon: React.ComponentType<any>;
  tone: string;
}[] = [
  // Grok
  { path: "/profiles", label: "Profiles", desc: "Browser sessions để chạy Grok", icon: Layers, tone: "violet" },
  { path: "/jobs", label: "Jobs", desc: "Lịch sử image/video", icon: Workflow, tone: "violet" },
  { path: "/grok/playground", label: "Playground", desc: "Submit job qua API key", icon: Activity, tone: "violet" },
  { path: "/api-docs", label: "API Docs", desc: "Reference cho client ngoài", icon: FileText, tone: "slate" },
  // Gateway
  { path: "/gateway", label: "Gateway", desc: "Quản lý vendor, pool, key", icon: Cpu, tone: "blue" },
  { path: "/gateway/playground", label: "Gateway Playground", desc: "Thử execute trực tiếp", icon: Activity, tone: "blue" },
  { path: "/gateway/requests", label: "Gateway Requests", desc: "Lịch sử request", icon: Workflow, tone: "blue" },
  { path: "/gateway/docs", label: "Gateway Docs", desc: "API reference", icon: FileText, tone: "slate" },
  // Flow
  { path: "/flow", label: "Flow Tools", desc: "Cut / Merge / Resize video", icon: Scissors, tone: "fuchsia" },
  { path: "/flow/requests", label: "Flow Requests", desc: "Job lifecycle", icon: Workflow, tone: "fuchsia" },
  { path: "/flow/docs", label: "Flow Docs", desc: "API reference", icon: FileText, tone: "slate" },
  // Core
  { path: "/api-keys", label: "API Keys", desc: "Tạo / thu hồi key", icon: Key, tone: "amber" },
  { path: "/audit-logs", label: "Audit Log", desc: "Hoạt động trong domain", icon: ScrollText, tone: "slate" },
  { path: "/settings", label: "Settings", desc: "Ngôn ngữ, thông báo", icon: Settings, tone: "slate" },
];

const TONE_BG: Record<string, string> = {
  violet:  "bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100",
  blue:    "bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100",
  fuchsia: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 hover:bg-fuchsia-100",
  amber:   "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100",
  slate:   "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100",
};

function QuickActions({ allowed }: { allowed: string[] }) {
  const allowedSet = new Set(allowed);
  // Match a card if its exact path OR its prefix is allowed (e.g. /flow
  // grants /flow/requests as well — but we want explicit cards anyway).
  const visible = QUICK_CARDS.filter((c) =>
    allowedSet.has(c.path) || allowed.some((p) => c.path.startsWith(p + "/")),
  );
  if (visible.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-700 mb-2">Truy cập nhanh</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((c) => (
          <Link
            key={c.path}
            to={c.path}
            className={`group rounded-lg p-4 ring-1 transition flex items-start gap-3 ${TONE_BG[c.tone]}`}
          >
            <c.icon size={22} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{c.label}</p>
                <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition" />
              </div>
              <p className="text-xs opacity-80 mt-0.5">{c.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RecentJobs({ jobs }: { jobs: JobLite[] }) {
  return (
    <div className="rounded-lg bg-white ring-1 ring-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">Job gần đây</h2>
        <Link to="/jobs" className="text-xs text-violet-600 hover:underline inline-flex items-center gap-1">
          Tất cả <ArrowRight size={12} />
        </Link>
      </div>
      {jobs.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Chưa có job nào.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {jobs.map((j) => (
            <li key={j.id} className="px-4 py-3 flex items-center gap-3">
              {j.job_type === "video"
                ? <Video size={16} className="text-violet-500 flex-shrink-0" />
                : <ImageIcon size={16} className="text-violet-500 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 truncate">{j.prompt || "(no prompt)"}</p>
                <p className="text-xs text-slate-500">
                  <span className="font-mono">{j.id.slice(0, 8)}</span>
                  <span className="mx-1">·</span>
                  <span>{relativeTime(j.created_at)}</span>
                </p>
              </div>
              <StatusBadge status={j.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SecondaryStats({ data }: { data: DashboardData | undefined }) {
  if (!data) return <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200" />;
  const t = data.totals;
  return (
    <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200 shadow-sm space-y-3">
      <h2 className="font-semibold text-slate-800">Tài nguyên</h2>
      <Row label="API Keys" value={fmt(t.api_keys)} icon={KeyRound} />
      <Row
        label="Profiles"
        value={`${fmt(t.profiles_logged_in)} / ${fmt(t.profiles)}`}
        sub="đăng nhập / tổng"
        icon={Layers}
      />
      <Row
        label="Slot pool"
        value={t.slots_total > 0 ? `${t.slots_used} / ${t.slots_total}` : "—"}
        sub={t.slots_total > 0 ? "đang dùng" : "không có pool"}
        icon={Cpu}
      />
    </div>
  );
}

function Row({
  label, value, sub, icon: Icon,
}: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<any>;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-md bg-slate-50 flex items-center justify-center flex-shrink-0">
        <Icon size={16} className="text-slate-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-800">
          {value}
          {sub && <span className="ml-1 text-xs font-normal text-slate-500">{sub}</span>}
        </p>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function greetByTime() {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function successRateLabel(success: number, total: number): string {
  if (total === 0) return "Chưa có job nào";
  return `${Math.round((success / total) * 100)}% tỷ lệ thành công`;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}
