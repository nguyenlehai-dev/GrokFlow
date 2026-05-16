import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Server as ServerIcon, ChevronRight, Cpu, MemoryStick, Network } from "lucide-react";

import { AdminGuard } from "@/modules/admin/components/AdminGuard";
import { serversService } from "../services/servers.service";
import type { ServerStatus } from "../models/types";

export function ServersListPage() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}

const STATUS_STYLE: Record<ServerStatus, string> = {
  active:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  stopped:   "bg-slate-100 text-slate-600 border-slate-200",
  suspended: "bg-amber-50 text-amber-700 border-amber-200",
  error:     "bg-rose-50 text-rose-700 border-rose-200",
};

function Inner() {
  const { t } = useTranslation();
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: () => serversService.list(),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <h1 className="page-title flex items-center gap-2">
        <ServerIcon size={22} /> {t("admin.servers_title")}
      </h1>

      {isLoading ? (
        <div className="card text-slate-500">{t("admin.servers_loading")}</div>
      ) : servers.length === 0 ? (
        <div className="card text-slate-500">{t("admin.servers_empty")}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {servers.map((s) => (
            <Link
              key={s.id}
              to={`/servers/${s.id}`}
              className="card group block border border-slate-200 hover:border-blue-500/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{s.hostname}</div>
                  <div className="text-xs text-slate-500">{s.ip} · {s.os}</div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[s.status]}`}>
                  {s.status}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                <Metric
                  icon={Cpu}
                  value={`${s.cpu_usage_pct}%`}
                  sub={`${s.cpu_cores} ${t("admin.servers_card_metric_cores")}`}
                />
                <Metric
                  icon={MemoryStick}
                  value={`${s.memory_used_gb.toFixed(1)}/${s.memory_total_gb}GB`}
                  sub={t("admin.servers_card_metric_memory")}
                />
                <Metric
                  icon={Network}
                  value={`${s.network_in_mbps + s.network_out_mbps} Mbps`}
                  sub={`/${s.network_cap_mbps}`}
                />
              </div>

              <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600
                              opacity-0 transition-opacity group-hover:opacity-100">
                {t("admin.servers_card_enter")} <ChevronRight size={12} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  icon: Icon, value, sub,
}: { icon: typeof Cpu; value: string; sub: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-slate-500 shrink-0" />
      <div className="min-w-0">
        <div className="truncate font-medium text-slate-800">{value}</div>
        <div className="text-[10px] text-slate-400">{sub}</div>
      </div>
    </div>
  );
}
