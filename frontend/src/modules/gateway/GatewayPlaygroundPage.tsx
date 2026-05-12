import { useState } from "react";
import { useForm } from "react-hook-form";
import { Terminal, Play, Loader2 } from "lucide-react";
import { gatewayApi } from "@/core/api/gateway";
import { toast } from "@/components/ui/Toast";
import { GatewayAuthGuard } from "./GatewayAuthGuard";
import { extractError } from "./GatewayProfilesPage";

const PRESETS = [
  {
    label: "GET /api/meta",
    method: "GET",
    path: "/api/meta",
    body: "",
  },
  {
    label: "GET /api/profiles",
    method: "GET",
    path: "/api/profiles",
    body: "",
  },
  {
    label: "GET /api/proxies",
    method: "GET",
    path: "/api/proxies",
    body: "",
  },
  {
    label: "GET /api/jobs",
    method: "GET",
    path: "/api/jobs",
    body: "",
  },
  {
    label: "POST /api/jobs",
    method: "POST",
    path: "/api/jobs",
    body: JSON.stringify({
      profile_id: "<profile-id>",
      target: "grok_image",
      prompt: "A cyberpunk Tokyo street at night",
      count: 1,
    }, null, 2),
  },
];

export function GatewayPlaygroundPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const [response, setResponse] = useState<{
    ok: boolean;
    status: number;
    durationMs: number;
    body: any;
  } | null>(null);
  const [running, setRunning] = useState(false);

  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      method: "GET",
      path: "/api/meta",
      body: "",
    },
  });
  const method = watch("method");

  const onSubmit = async (v: { method: string; path: string; body: string }) => {
    setRunning(true);
    setResponse(null);
    const start = performance.now();
    try {
      let parsedBody: any = undefined;
      if (v.body.trim() && v.method !== "GET" && v.method !== "DELETE") {
        try {
          parsedBody = JSON.parse(v.body);
        } catch {
          toast("Body không phải JSON hợp lệ", "error");
          setRunning(false);
          return;
        }
      }
      const r = await gatewayApi.request({
        method: v.method,
        url: v.path,
        data: parsedBody,
        validateStatus: () => true,
      });
      setResponse({
        ok: r.status < 400,
        status: r.status,
        durationMs: Math.round(performance.now() - start),
        body: r.data,
      });
    } catch (e: any) {
      setResponse({
        ok: false,
        status: e?.response?.status ?? 0,
        durationMs: Math.round(performance.now() - start),
        body: { error: extractError(e) },
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Terminal size={22} /> Gateway — Playground
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Gọi thẳng API gatewaygrok-backend để test. Tự gắn admin token từ session.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p, i) => (
          <button
            key={i}
            onClick={() => {
              setValue("method", p.method);
              setValue("path", p.path);
              setValue("body", p.body);
            }}
            className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-xs font-mono"
          >
            <span className={`mr-2 font-bold ${
              p.method === "GET" ? "text-emerald-600"
              : p.method === "POST" ? "text-blue-600"
              : "text-amber-600"
            }`}>{p.method}</span>
            {p.path}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-3">
        <div className="grid grid-cols-[120px_1fr] gap-2">
          <select className="input" {...register("method")}>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input className="input font-mono" {...register("path", { required: true })}
            placeholder="/api/profiles" />
        </div>

        {(method === "POST" || method === "PUT" || method === "PATCH") && (
          <div>
            <label className="text-sm font-medium">Body (JSON)</label>
            <textarea
              className="input font-mono text-xs"
              rows={6}
              placeholder='{"key": "value"}'
              {...register("body")}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={running}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? "Đang gọi..." : "Send request"}
        </button>
      </form>

      {response && (
        <div className="card space-y-2">
          <div className="flex items-center gap-3">
            <span className={`text-sm font-semibold px-2 py-1 rounded ${
              response.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            }`}>
              HTTP {response.status}
            </span>
            <span className="text-xs text-slate-500">{response.durationMs}ms</span>
          </div>
          <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs whitespace-pre-wrap overflow-auto max-h-96">
            {JSON.stringify(response.body, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
