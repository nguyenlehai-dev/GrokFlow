import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { dashboardService } from "../services/dashboard.service";

export function GatewayDashboardPage() {
  const { t } = useTranslation();
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["gw-llm-dashboard"],
    queryFn: () => dashboardService.stats(),
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <LayoutDashboard size={22} /> {t("gateway.gw_dashboard_title")}
        </h1>
        <button onClick={() => refetch()} className="btn-ghost text-xs inline-flex items-center gap-1">
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> {t("gateway.gw_dashboard_refresh")}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Tile label={t("gateway.gw_dashboard_vendors")} main={data?.vendors_total ?? "—"} />
        <Tile label={t("gateway.gw_dashboard_functions")} main={data?.functions_total ?? "—"} />
        <Tile label={t("gateway.gw_dashboard_pools")} main={data?.pools_total ?? "—"} sub={t("gateway.gw_dashboard_active_sub", { value: data?.pools_active ?? 0 })} />
        <Tile label={t("gateway.gw_dashboard_pool_keys")} main={data?.pool_keys_total ?? "—"} sub={t("gateway.gw_dashboard_active_sub", { value: data?.pool_keys_active ?? 0 })} />
        <Tile label={t("gateway.gw_dashboard_gateway_keys")} main={data?.gateway_keys_total ?? "—"} sub={t("gateway.gw_dashboard_active_sub", { value: data?.gateway_keys_active ?? 0 })} />
        <Tile label={t("gateway.gw_dashboard_requests_24h")} main={data?.requests_last_24h ?? "—"} accent="text-blue-600" />
        <Tile label={t("gateway.gw_dashboard_succeeded")} main={data?.requests_succeeded ?? "—"} accent="text-emerald-600" />
        <Tile label={t("gateway.gw_dashboard_failed")} main={data?.requests_failed ?? "—"} accent={data?.requests_failed ? "text-rose-600" : ""} />
      </div>
    </div>
  );
}

function Tile({
  label, main, sub, accent,
}: { label: string; main: number | string; sub?: string; accent?: string }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accent ?? "text-slate-800"}`}>{main}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}
