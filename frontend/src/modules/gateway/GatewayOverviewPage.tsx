import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { gatewayApi } from "@/core/api/gateway";
import { GatewayAuthGuard } from "./GatewayAuthGuard";
import { ErrorPanel } from "./GatewayProfilesPage";
import { providerVisuals } from "./providerVisuals";
import type { Category } from "./providerVisuals";

interface OverviewRecord {
  profiles: { total: number; active: number };
  proxies: { total: number; active: number };
  api_keys: { total: number; active: number };
  queue: { pending: number; running: number; succeeded: number; failed: number };
  categories: Array<{ category: Category; total: number }>;
}

interface MetaRecord {
  categories: Category[];
  job_targets: string[];
  job_statuses: string[];
  providers: Array<{
    category: Category;
    provider_name: string;
    targets: string[];
    supports_cookie_import: boolean;
    supports_proxy: boolean;
    supports_antidetect: boolean;
    start_url: string | null;
    notes: string | null;
  }>;
}

export function GatewayOverviewPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const overview = useQuery({
    queryKey: ["gw-overview"],
    queryFn: async () => (await gatewayApi.get<OverviewRecord>("/api/overview")).data,
    retry: false,
    refetchInterval: 15000,
  });
  const meta = useQuery({
    queryKey: ["gw-meta"],
    queryFn: async () => (await gatewayApi.get<MetaRecord>("/api/meta")).data,
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
            <LayoutDashboard size={22} /> Gateway — Overview
          </h1>
          <p className="text-sm text-ink-400 mt-1">
            Auto-refresh mỗi 15s — toàn cảnh gateway operations.
          </p>
        </div>
        <button
          onClick={() => { overview.refetch(); meta.refetch(); }}
          className="btn-ghost inline-flex items-center gap-1.5 text-xs"
        >
          <RefreshCw size={12} className={overview.isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error ? (
        <ErrorPanel error={error} />
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Total Profiles" main={o?.profiles.total ?? "—"} sub={`${o?.profiles.active ?? 0} active`} />
            <Stat label="Total Proxies" main={o?.proxies.total ?? "—"} sub={`${o?.proxies.active ?? 0} enabled`} />
            <Stat label="Total API Keys" main={o?.api_keys.total ?? "—"} sub={`${o?.api_keys.active ?? 0} active`} />
            <Stat
              label="Queue Pending"
              main={o?.queue.pending ?? "—"}
              sub={`${o?.queue.running ?? 0} running, ${o?.queue.succeeded ?? 0} ok, ${o?.queue.failed ?? 0} failed`}
            />
          </div>

          {/* Provider cards */}
          <section className="card space-y-3">
            <h2 className="font-semibold">Providers — capabilities</h2>
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
                        {p.notes ?? "Ready for cookie import, proxy & antidetect setup."}
                      </p>
                      <div className="flex gap-1.5 mt-1.5 text-[10px]">
                        {p.supports_cookie_import && <span className="px-1.5 py-0.5 rounded bg-ink-900/10">cookies</span>}
                        {p.supports_proxy && <span className="px-1.5 py-0.5 rounded bg-ink-900/10">proxy</span>}
                        {p.supports_antidetect && <span className="px-1.5 py-0.5 rounded bg-ink-900/10">antidetect</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Category mix */}
          <section className="card space-y-3">
            <h2 className="font-semibold">Profile allocation</h2>
            <div className="space-y-2">
              {(o?.categories ?? []).map((c) => {
                const v = providerVisuals[c.category];
                const pct = Math.max(8, (c.total / Math.max(o?.profiles.total ?? 1, 1)) * 100);
                return (
                  <div key={c.category} className="flex items-center gap-3">
                    <span className="w-24 text-sm">{v.label}</span>
                    <div className="flex-1 h-6 bg-ink-800 rounded overflow-hidden">
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
                <p className="text-sm text-ink-500">Chưa có profile nào.</p>
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
      <div className="text-sm text-ink-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{main}</div>
      <div className="text-xs text-ink-500 mt-1">{sub}</div>
    </div>
  );
}
