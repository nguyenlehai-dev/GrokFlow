import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { gwApi } from "./common";

interface Stats {
  vendors_total: number;
  pools_total: number;
  pools_active: number;
  pool_keys_total: number;
  pool_keys_active: number;
  functions_total: number;
  gateway_keys_total: number;
  gateway_keys_active: number;
  requests_total: number;
  requests_failed: number;
  requests_succeeded: number;
  requests_last_24h: number;
}

export function GatewayDashboardPage() {
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["gw-llm-dashboard"],
    queryFn: async () => (await gwApi.get<Stats>("/api/v1/gateway/dashboard")).data,
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <LayoutDashboard size={22} /> Gateway — Dashboard
        </h1>
        <button onClick={() => refetch()} className="btn-ghost text-xs inline-flex items-center gap-1">
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Tile label="Vendors" main={data?.vendors_total ?? "—"} />
        <Tile label="API Functions" main={data?.functions_total ?? "—"} />
        <Tile label="Pools" main={data?.pools_total ?? "—"} sub={`${data?.pools_active ?? 0} active`} />
        <Tile label="Pool API Keys" main={data?.pool_keys_total ?? "—"} sub={`${data?.pool_keys_active ?? 0} active`} />
        <Tile label="Gateway Keys" main={data?.gateway_keys_total ?? "—"} sub={`${data?.gateway_keys_active ?? 0} active`} />
        <Tile label="Requests (24h)" main={data?.requests_last_24h ?? "—"} accent="text-blue-600" />
        <Tile label="Succeeded" main={data?.requests_succeeded ?? "—"} accent="text-emerald-600" />
        <Tile label="Failed" main={data?.requests_failed ?? "—"} accent={data?.requests_failed ? "text-rose-600" : ""} />
      </div>
    </div>
  );
}

function Tile({
  label, main, sub, accent,
}: { label: string; main: number | string; sub?: string; accent?: string }) {
  return (
    <div className="card">
      <div className="text-sm text-ink-400">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accent ?? "text-white"}`}>{main}</div>
      {sub && <div className="text-xs text-ink-500 mt-1">{sub}</div>}
    </div>
  );
}
