import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/core/auth/store";
import type { Period } from "../models/dashboard";
import { dashboardService } from "../services/dashboard.service";
import { domainsService } from "../services/domains.service";
import {
  DashboardKpi,
  DashboardPeriodTabs,
  DashboardScopeBtn,
  PERIOD_LABEL,
} from "../components/DashboardKpi";
import { formatNum } from "@/core/utils/format";
import { DashboardPerDomainSection } from "../components/DashboardPerDomainSection";
import { DashboardRevenueCard } from "../components/DashboardRevenueCard";
import { DashboardJobsTimeseriesCard } from "../components/DashboardJobsTimeseriesCard";
import { DashboardAppStatsSection } from "../components/DashboardAppStatsSection";
import { PendingBillingWidget } from "../components/PendingBillingWidget";

export function DashboardPage() {
  const { t } = useTranslation();
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
    queryFn: () => domainsService.listAs<{ id: string; hostname: string }>(),
    enabled: isSuper,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", scope, period, appDomain],
    queryFn: () => {
      const params: Record<string, string> = { period };
      if (scope === "admin" && appDomain) params.domain_id = appDomain;
      return scope === "admin"
        ? dashboardService.admin(params)
        : dashboardService.me(params);
    },
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {t("dashboard.title")}{" "}
            <span className="text-gradient">
              {scope === "admin" ? t("dashboard.scope_system") : t("dashboard.scope_personal")}
            </span>
          </h1>
          <p className="page-subtitle flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-soft" />
            {t("dashboard.auto_refresh")} · {PERIOD_LABEL[period]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-card">
              <DashboardScopeBtn active={scope === "admin"} onClick={() => setScope("admin")}>{t("dashboard.scope_system")}</DashboardScopeBtn>
              <DashboardScopeBtn active={scope === "me"} onClick={() => setScope("me")}>{t("dashboard.scope_me")}</DashboardScopeBtn>
            </div>
          )}
          <DashboardPeriodTabs value={period} onChange={setPeriod} />
        </div>
      </div>

      {isLoading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
      ) : error && !data ? (
        <div className="alert-danger">
          {t("dashboard.load_error", {
            message: (error as any)?.message ?? t("dashboard.load_error_fallback"),
          })}
        </div>
      ) : data ? (
        <>
          {/* Top KPI row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <DashboardKpi label={t("dashboard.kpi_jobs_total")} value={formatNum(data.totals.jobs_total)}
              sub={t("dashboard.kpi_jobs_today_sub", { value: formatNum(data.totals.jobs_today) })} />
            <DashboardKpi label={t("dashboard.kpi_jobs_success")} value={formatNum(data.totals.jobs_success)}
              accent="text-emerald-600" />
            <DashboardKpi label={t("dashboard.kpi_jobs_failed")} value={formatNum(data.totals.jobs_failed)}
              accent={data.totals.jobs_failed > 0 ? "text-rose-600" : ""} />
            <DashboardKpi
              label={t("dashboard.kpi_slot_pool")}
              value={`${data.totals.slots_used}/${data.totals.slots_total}`}
              sub={t("dashboard.kpi_profiles_ready_sub", { value: data.totals.profiles_logged_in })}
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
            <DashboardKpi label={t("dashboard.kpi_jobs_queued")} value={formatNum(data.totals.jobs_queued)} accent="text-blue-600" />
            <DashboardKpi label={t("dashboard.kpi_jobs_running")} value={formatNum(data.totals.jobs_running)} accent="text-amber-600" />
            <DashboardKpi
              label={t("dashboard.kpi_profiles_need_login")}
              value={formatNum(data.totals.profiles_need_login)}
              accent={data.totals.profiles_need_login > 0 ? "text-rose-600" : ""}
            />
            {scope === "admin" ? (
              <DashboardKpi label={t("dashboard.kpi_users")} value={formatNum(data.totals.users)} />
            ) : (
              <DashboardKpi label={t("dashboard.kpi_api_keys")} value={formatNum(data.totals.api_keys)} />
            )}
          </div>

          {/* Revenue chart + jobs timeseries */}
          <div className="grid gap-4 lg:grid-cols-2">
            <DashboardRevenueCard data={data.revenue} total={data.totals.revenue_total} />
            <DashboardJobsTimeseriesCard data={data.jobs_timeseries} />
          </div>

          {/* Pending upgrade requests — admin can confirm in-line without
              jumping to the Billing Manager. Auto-polls every 30s so new
              checkouts show up here as soon as the user submits. */}
          {scope === "admin" && <PendingBillingWidget />}

          {/* Per-domain breakdown — admin scope only, shows nothing on /me */}
          {scope === "admin" && data.per_domain && data.per_domain.length > 0 && (
            <DashboardPerDomainSection rows={data.per_domain} period={period} />
          )}

          {/* App stats — Grok / Flow / Gateway / Mini-Apps, filterable by domain */}
          <DashboardAppStatsSection
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
