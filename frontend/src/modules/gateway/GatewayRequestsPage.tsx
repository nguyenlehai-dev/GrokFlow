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
  tokens_input: number | null;
  tokens_output: number | null;
  cost_cents: number | null;
  request_body: Record<string, any> | null;
  response_body: Record<string, any> | null;
  created_at: string;
}

function extractResponseText(rb: Record<string, any> | null): string | null {
  if (!rb) return null;
  // Our /execute normalizes Gemini/OpenAI/Anthropic shapes to { text, media_urls, ... }
  if (typeof rb.text === "string" && rb.text.trim()) return rb.text.trim();
  // Fallback: Gemini raw → candidates[0].content.parts[].text
  const cands = rb?.raw?.candidates;
  if (Array.isArray(cands) && cands[0]?.content?.parts) {
    return cands[0].content.parts
      .map((p: any) => p?.text || "")
      .filter(Boolean)
      .join("\n")
      .trim() || null;
  }
  return null;
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
        <h1 className="page-title flex items-center gap-2">
          <Activity size={22} /> Gateway — Requests
        </h1>
        <button onClick={() => refetch()} className="btn-ghost text-xs inline-flex items-center gap-1">
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">Gateway Requests</h2>
        {(data ?? []).length === 0 ? (
          <p className="text-ink-400 text-sm">Chưa có request nào.</p>
        ) : (
          <div className="space-y-2">
            {data!.map((r) => {
              const prompt = typeof r.request_body?.prompt === "string"
                ? r.request_body!.prompt : null;
              const respText = extractResponseText(r.response_body);
              return (
                <div key={r.id} className="border border-ink-800 rounded p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <strong className="font-mono text-sm">{r.gw_id}</strong>
                        <StatusPill status={r.status} />
                        {r.latency_ms != null && (
                          <span className="text-xs text-ink-400">{r.latency_ms}ms</span>
                        )}
                      </div>
                      <div className="text-xs text-ink-400 mt-0.5">
                        {[r.vendor_name, r.pool_name].filter(Boolean).join(" / ")}
                        {r.function_code && <span> · {r.function_code}</span>}
                      </div>
                      <div className="text-xs text-ink-400 font-mono">
                        {r.model ?? "—"} {r.pool_key_name && `· ${r.pool_key_name}`}
                      </div>
                      {(r.tokens_input != null || r.tokens_output != null || r.cost_cents != null) && (
                        <div className="text-xs text-ink-300 mt-0.5">
                          {r.tokens_input != null && <span>in: <strong>{r.tokens_input}</strong></span>}
                          {r.tokens_output != null && <span className="ml-2">out: <strong>{r.tokens_output}</strong></span>}
                          {r.cost_cents != null && r.cost_cents > 0 && (
                            <span className="ml-2 text-emerald-700">
                              ${(r.cost_cents / 100).toFixed(4)}
                            </span>
                          )}
                        </div>
                      )}
                      {prompt && (
                        <details className="mt-2 group">
                          <summary className="text-xs text-ink-400 cursor-pointer hover:text-ink-200">
                            Prompt ({prompt.length} chars)
                          </summary>
                          <p className="text-xs text-ink-200 mt-1 whitespace-pre-wrap break-words bg-ink-900 p-2 rounded">
                            {prompt}
                          </p>
                        </details>
                      )}
                      {respText && (
                        <details className="mt-2" open>
                          <summary className="text-xs text-emerald-700 cursor-pointer hover:text-emerald-800 font-medium">
                            Response ({respText.length} chars)
                          </summary>
                          <p className="text-sm text-ink-100 mt-1 whitespace-pre-wrap break-words bg-emerald-50 p-3 rounded leading-relaxed">
                            {respText}
                          </p>
                        </details>
                      )}
                      {r.error_message && (
                        <p className="text-xs text-rose-600 mt-1 whitespace-pre-wrap">
                          {r.error_message}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-ink-500 font-mono whitespace-nowrap">
                      {new Date(r.created_at).toLocaleTimeString("vi-VN")}
                    </span>
                  </div>
                </div>
              );
            })}
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
    : "bg-ink-800 text-ink-300";
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{status}</span>;
}
