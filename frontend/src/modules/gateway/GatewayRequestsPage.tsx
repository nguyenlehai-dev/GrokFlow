import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { gwApi } from "./common";

interface Req {
  id: string;
  gw_id: string;
  vendor_name: string | null;
  pool_name: string | null;
  pool_key_name: string | null;
  function_code: string | null;
  model: string | null;
  status: string;
  error_message: string | null;
  latency_ms: number | null;
  created_at: string;
}

export function GatewayRequestsPage() {
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["gw-requests"],
    queryFn: async () => (await gwApi.get<Req[]>("/api/v1/gateway/requests?limit=200")).data,
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Activity size={22} /> Gateway — Requests
        </h1>
        <button onClick={() => refetch()} className="btn-ghost text-xs inline-flex items-center gap-1">
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">Gateway Requests</h2>
        {(data ?? []).length === 0 ? (
          <p className="text-slate-500 text-sm">Chưa có request nào.</p>
        ) : (
          <div className="space-y-2">
            {data!.map((r) => (
              <div key={r.id} className="border border-slate-200 rounded p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="font-mono text-sm">{r.gw_id}</strong>
                      <StatusPill status={r.status} />
                      {r.latency_ms != null && (
                        <span className="text-xs text-slate-500">{r.latency_ms}ms</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {[r.vendor_name, r.pool_name].filter(Boolean).join(" / ")}
                      {r.function_code && <span> · {r.function_code}</span>}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      {r.model ?? "—"} {r.pool_key_name && `· ${r.pool_key_name}`}
                    </div>
                    {r.error_message && (
                      <p className="text-xs text-rose-600 mt-1 line-clamp-3">
                        {r.error_message}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                    {new Date(r.created_at).toLocaleTimeString("vi-VN")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "succeeded" || status === "success" ? "bg-emerald-100 text-emerald-700"
    : status === "running" || status === "pending" ? "bg-amber-100 text-amber-700"
    : status === "failed" ? "bg-rose-100 text-rose-700"
    : "bg-slate-100 text-slate-600";
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{status}</span>;
}
