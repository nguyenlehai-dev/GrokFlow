import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Layers, Workflow, Cpu, CheckCircle2, AlertCircle, Clock, KeyRound,
} from "lucide-react";
import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import type { TenantDashboardData as DashboardData } from "../models/dashboard";
import { dashboardService } from "../services/dashboard.service";
import { TenantQuickActions } from "../components/TenantQuickActions";
import { TenantRecentJobs } from "../components/TenantRecentJobs";

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

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

export function TenantDashboardPage() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const domain = useDomainStore((s) => s.config);
  const [period, setPeriod] = useState<Period>("today");

  const PERIODS: { v: Period; label: string }[] = [
    { v: "today", label: t("admin.tenant_dash_period_today") },
    { v: "week",  label: t("admin.tenant_dash_period_week") },
    { v: "month", label: t("admin.tenant_dash_period_month") },
    { v: "all",   label: t("admin.tenant_dash_period_all") },
  ];

  const { data, isLoading } = useQuery({
    queryKey: ["tenant-dashboard", period],
    queryFn: () => dashboardService.tenantMe({ period }),
    refetchInterval: 30_000,
  });

  // Last 5 jobs — tenant-scoped because /api/jobs filters by user_id
  // and tenant admins fall back to their domain users via backend logic.
  const { data: recentJobs } = useQuery({
    queryKey: ["tenant-dashboard-recent-jobs"],
    queryFn: () => dashboardService.recentJobs(5),
    refetchInterval: 15_000,
  });

  const brand = domain?.brand_name || domain?.label || t("admin.tenant_dash_brand_fallback");
  const greeting = greetByTime(t);

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
          <PeriodTabs value={period} onChange={setPeriod} periods={PERIODS} />
        </div>
      </div>

      {/* KPIs */}
      {isLoading && !data ? (
        <p className="text-slate-500">{t("admin.tenant_dash_loading")}</p>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label={t("admin.tenant_dash_kpi_total")}
            value={fmt(data.totals.jobs_total)}
            sub={t("admin.tenant_dash_kpi_total_sub", { value: fmt(data.totals.jobs_today) })}
            icon={Workflow}
            tone="violet"
          />
          <Kpi
            label={t("admin.tenant_dash_kpi_success")}
            value={fmt(data.totals.jobs_success)}
            sub={successRateLabel(t, data.totals.jobs_success, data.totals.jobs_total)}
            icon={CheckCircle2}
            tone="emerald"
          />
          <Kpi
            label={t("admin.tenant_dash_kpi_processing")}
            value={fmt(data.totals.jobs_queued + data.totals.jobs_running)}
            sub={t("admin.tenant_dash_kpi_processing_sub", { value: fmt(data.totals.jobs_running) })}
            icon={Clock}
            tone="amber"
          />
          <Kpi
            label={t("admin.tenant_dash_kpi_failed")}
            value={fmt(data.totals.jobs_failed)}
            sub={data.totals.jobs_failed > 0
              ? t("admin.tenant_dash_kpi_failed_check")
              : t("admin.tenant_dash_kpi_failed_clean")}
            icon={AlertCircle}
            tone={data.totals.jobs_failed > 0 ? "rose" : "emerald"}
          />
        </div>
      ) : null}

      {/* Quick actions — filtered by allowed_pages so each tenant sees
          only their modules */}
      <TenantQuickActions allowed={domain?.allowed_pages ?? []} />

      {/* Recent activity + secondary stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TenantRecentJobs jobs={recentJobs ?? []} />
        </div>
        <SecondaryStats data={data} />
      </div>
    </div>
  );
}

// ─── Inline orchestrator-local sub-components ──────────────────────────────

function PeriodTabs({
  value, onChange, periods,
}: {
  value: Period;
  onChange: (v: Period) => void;
  periods: { v: Period; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md bg-white/15 p-0.5">
      {periods.map((p) => (
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
  violet:  { ring: "ring-violet-100",  icon: "text-violet-500",  value: "text-slate-800" },
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

function SecondaryStats({ data }: { data: DashboardData | undefined }) {
  const { t } = useTranslation();
  if (!data) return <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200" />;
  const tt = data.totals;
  return (
    <div className="rounded-lg bg-white p-4 ring-1 ring-slate-200 shadow-sm space-y-3">
      <h2 className="font-semibold text-slate-800">{t("admin.tenant_dash_resources")}</h2>
      <Row label={t("admin.tenant_dash_api_keys")} value={fmt(tt.api_keys)} icon={KeyRound} />
      <Row
        label={t("admin.tenant_dash_profiles")}
        value={`${fmt(tt.profiles_logged_in)} / ${fmt(tt.profiles)}`}
        sub={t("admin.tenant_dash_profiles_sub")}
        icon={Layers}
      />
      <Row
        label={t("admin.tenant_dash_slot_pool")}
        value={tt.slots_total > 0 ? `${tt.slots_used} / ${tt.slots_total}` : "—"}
        sub={tt.slots_total > 0 ? t("admin.tenant_dash_slot_in_use") : t("admin.tenant_dash_slot_no_pool")}
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
      <div className="w-9 h-9 rounded-md bg-white flex items-center justify-center flex-shrink-0">
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

function greetByTime(t: (k: string) => string) {
  const h = new Date().getHours();
  if (h < 11) return t("admin.tenant_dash_greet_morning");
  if (h < 14) return t("admin.tenant_dash_greet_noon");
  if (h < 18) return t("admin.tenant_dash_greet_afternoon");
  return t("admin.tenant_dash_greet_evening");
}

function successRateLabel(t: (k: string, opts?: any) => string, success: number, total: number): string {
  if (total === 0) return t("admin.tenant_dash_no_jobs");
  return t("admin.tenant_dash_success_rate", { value: Math.round((success / total) * 100) });
}
