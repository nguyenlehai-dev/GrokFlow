import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { GatewayAuthGuard } from "../components/GatewayAuthGuard";
import { ErrorPanel } from "../components/ErrorPanel";
import { providerVisuals } from "../configs/providerVisuals";
import { overviewService } from "../services/overview.service";

export function GatewayOverviewPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const { t } = useTranslation();
  const overview = useQuery({
    queryKey: ["gw-overview"],
    queryFn: () => overviewService.overview(),
    retry: false,
    refetchInterval: 15000,
  });
  const meta = useQuery({
    queryKey: ["gw-meta"],
    queryFn: () => overviewService.meta(),
    retry: false,
  });

  const error = overview.error || meta.error;
  const o = overview.data;
  const m = meta.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <LayoutDashboard size={22} /> {t("gateway.overview_title")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t("gateway.overview_subtitle")}</p>
        </div>
        <button
          onClick={() => { overview.refetch(); meta.refetch(); }}
          className="btn-ghost inline-flex items-center gap-1.5 text-xs"
        >
          <RefreshCw size={12} className={overview.isFetching ? "animate-spin" : ""} /> {t("gateway.refresh")}
        </button>
      </div>

      {error ? (
        <ErrorPanel error={error} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label={t("gateway.kpi_profiles")} main={o?.profiles.total ?? "—"} sub={`${o?.profiles.active ?? 0} ${t("gateway.kpi_active_suffix")}`} />
            <Stat label={t("gateway.kpi_proxies")} main={o?.proxies.total ?? "—"} sub={`${o?.proxies.active ?? 0} ${t("gateway.kpi_enabled_suffix")}`} />
            <Stat label={t("gateway.kpi_api_keys")} main={o?.api_keys.total ?? "—"} sub={`${o?.api_keys.active ?? 0} ${t("gateway.kpi_active_suffix")}`} />
            <Stat
              label={t("gateway.kpi_queue")}
              main={o?.queue.pending ?? "—"}
              sub={`${o?.queue.running ?? 0} running, ${o?.queue.succeeded ?? 0} ok, ${o?.queue.failed ?? 0} failed`}
            />
          </div>

          <section className="card space-y-3">
            <h2 className="font-semibold">{t("gateway.providers_title")}</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {(m?.providers ?? []).map((p) => {
                const v = providerVisuals[p.category];
                return (
                  <div
                    key={p.category}
                    className="rounded-lg p-3 text-slate-100 flex gap-3"
                    style={{ backgroundColor: v.surface, borderLeft: `4px solid ${v.accent}` }}
                  >
                    <img src={v.image} alt={v.label} className="w-10 h-10 rounded" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <strong>{v.label}</strong>
                        <span className="text-xs opacity-70 font-mono">{p.targets.join(", ")}</span>
                      </div>
                      {p.start_url && (
                        <p className="text-xs opacity-70 truncate mt-0.5">{p.start_url}</p>
                      )}
                      <p className="text-xs opacity-80 mt-1">
                        {p.notes ?? t("gateway.providers_default_notes")}
                      </p>
                      <div className="flex gap-1.5 mt-1.5 text-[10px]">
                        {p.supports_cookie_import && <span className="px-1.5 py-0.5 rounded bg-white/10">cookies</span>}
                        {p.supports_proxy && <span className="px-1.5 py-0.5 rounded bg-white/10">proxy</span>}
                        {p.supports_antidetect && <span className="px-1.5 py-0.5 rounded bg-white/10">antidetect</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">{t("gateway.alloc_title")}</h2>
            <div className="space-y-2">
              {(o?.categories ?? []).map((c) => {
                const v = providerVisuals[c.category];
                const pct = Math.max(8, (c.total / Math.max(o?.profiles.total ?? 1, 1)) * 100);
                return (
                  <div key={c.category} className="flex items-center gap-3">
                    <span className="w-24 text-sm">{v.label}</span>
                    <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: v.accent }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm font-mono font-semibold">{c.total}</span>
                  </div>
                );
              })}
              {(o?.categories ?? []).length === 0 && (
                <p className="text-sm text-slate-400">{t("gateway.alloc_empty")}</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, main, sub }: { label: string; main: number | string; sub: string }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-800">{main}</div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  );
}
