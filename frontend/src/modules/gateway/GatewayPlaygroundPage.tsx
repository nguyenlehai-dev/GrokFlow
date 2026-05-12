import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Terminal, Play, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { gwApi, extractError } from "./common";
import { toast } from "@/components/ui/Toast";

interface Vendor { id: string; name: string; code: string; }
interface Func { id: string; code: string; name: string; function_type: string; }
interface Pool { id: string; name: string; vendor_id: string; function_id: string | null; model: string | null; }
interface ExecuteResp {
  request_id: string;
  gw_id: string;
  status: string;
  pool_key_name: string | null;
  response: any;
  error_message: string | null;
}

export function GatewayPlaygroundPage() {
  const [verifyingKey, setVerifyingKey] = useState("");
  const [verifiedKey, setVerifiedKey] = useState<{ label: string; functions: string[] } | null>(null);
  const [response, setResponse] = useState<ExecuteResp | null>(null);

  const { data: vendors } = useQuery({
    queryKey: ["gw-vendors"],
    queryFn: async () => (await gwApi.get<Vendor[]>("/api/v1/gateway/vendors")).data,
  });
  const { data: functions } = useQuery({
    queryKey: ["gw-functions"],
    queryFn: async () => (await gwApi.get<Func[]>("/api/v1/gateway/functions")).data,
  });
  const { data: pools } = useQuery({
    queryKey: ["gw-pools"],
    queryFn: async () => (await gwApi.get<Pool[]>("/api/v1/gateway/pools")).data,
  });

  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      vendor_id: "",
      function_id: "",
      pool_id: "",
      model: "",
      prompt: "",
      aspect_ratio: "1:1",
      image_size: "1K",
      reference_image_urls: "",
      reference_video_urls: "",
    },
  });
  const fnId = watch("function_id");
  const selectedFn = functions?.find((f) => f.id === fnId);

  const verify = useMutation({
    mutationFn: (key: string) =>
      gwApi.post<{ verified: boolean; label: string | null; allowed_functions: string[] }>(
        "/api/v1/gateway/gateway-keys/verify", { key },
      ),
    onSuccess: ({ data }) => {
      if (data.verified) {
        setVerifiedKey({ label: data.label ?? "", functions: data.allowed_functions });
        toast("Đã verify Gateway API Key", "success");
      } else {
        toast("Key không hợp lệ", "error");
      }
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  const buildPayload = (v: any) => ({
    model: v.model || null,
    prompt: v.prompt,
    aspect_ratio: v.aspect_ratio || null,
    image_size: v.image_size || null,
    reference_image_urls: v.reference_image_urls
      ? v.reference_image_urls.split("\n").map((s: string) => s.trim()).filter(Boolean) : [],
    reference_video_urls: v.reference_video_urls
      ? v.reference_video_urls.split("\n").map((s: string) => s.trim()).filter(Boolean) : [],
  });

  const execute = useMutation({
    mutationFn: async (v: any) => {
      if (!selectedFn) throw new Error("Chọn function");
      const r = await gwApi.post<ExecuteResp>(
        `/api/v1/gateway/functions/${selectedFn.code}/execute`, buildPayload(v),
      );
      return r.data;
    },
    onSuccess: (data) => {
      setResponse(data);
      toast(data.status === "succeeded" ? "Execute thành công" : "Execute lỗi", data.status === "succeeded" ? "success" : "error");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  const [statusGwId, setStatusGwId] = useState("");

  const submitAsync = useMutation({
    mutationFn: async (v: any) => {
      if (!selectedFn) throw new Error("Chọn function");
      const r = await gwApi.post<ExecuteResp>(
        `/api/v1/gateway/functions/${selectedFn.code}/submit`, buildPayload(v),
      );
      return r.data;
    },
    onSuccess: (data) => {
      setResponse(data);
      setStatusGwId(data.gw_id);  // ready for Check Status
      toast(`Submitted: ${data.gw_id}`, "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });
  const checkStatus = useMutation({
    mutationFn: async (gwId: string) =>
      (await gwApi.get<ExecuteResp & { status: string }>(
        `/api/v1/gateway/requests/${gwId}/status`,
      )).data,
    onSuccess: (data) => {
      // Map to ExecuteResp shape for the result panel
      setResponse({
        request_id: (data as any).id,
        gw_id: data.gw_id,
        status: data.status,
        pool_key_name: (data as any).pool_key_name ?? null,
        response: (data as any).response_body ?? null,
        error_message: (data as any).error_message ?? null,
      } as ExecuteResp);
      toast(`Status: ${data.status}`, "info");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold flex items-center gap-2">
        <Terminal size={22} /> Gateway — Playground
      </h1>

      {/* Verify gateway key */}
      <div className="card space-y-2">
        <h2 className="font-semibold">Gateway API Key</h2>
        {verifiedKey ? (
          <div className="border border-emerald-200 bg-emerald-50 rounded p-3 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <strong>Đã verify · {verifiedKey.label}</strong>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Allowed: {verifiedKey.functions.length ? verifiedKey.functions.join(", ") : "all"}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              className="input flex-1 font-mono text-sm"
              placeholder="gwk_live_..."
              value={verifyingKey}
              onChange={(e) => setVerifyingKey(e.target.value)}
            />
            <button
              onClick={() => verify.mutate(verifyingKey)}
              disabled={!verifyingKey || verify.isPending}
              className="btn-primary"
            >
              Verify
            </button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
        {/* Form */}
        <form
          onSubmit={handleSubmit((v) => execute.mutate(v))}
          className="card space-y-3"
        >
          <h2 className="font-semibold">Playground</h2>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium">Vendor</label>
              <select className="input text-sm" {...register("vendor_id")}>
                <option value="">— any —</option>
                {(vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Pool</label>
              <select className="input text-sm" {...register("pool_id")}>
                <option value="">— auto —</option>
                {(pools ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">API Function</label>
              <select className="input text-sm" {...register("function_id", { required: true })}>
                <option value="">— chọn —</option>
                {(functions ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">Model</label>
            <input className="input text-sm font-mono" placeholder="gemini-2.5-flash" {...register("model")} />
          </div>

          <div>
            <label className="text-xs font-medium">Prompt</label>
            <textarea className="input" rows={3} placeholder="Prompt..." {...register("prompt", { required: true })} />
          </div>

          {selectedFn?.function_type === "image" && (
            <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
              <strong className="text-blue-700">Image Generation</strong>
              <p className="text-xs text-slate-600 mt-0.5">
                Không upload ảnh tham chiếu thì đây là text-to-image. Upload reference URLs thì đây là image-to-image / reference-based.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium">Aspect Ratio</label>
              <select className="input text-sm" {...register("aspect_ratio")}>
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Image Size</label>
              <select className="input text-sm" {...register("image_size")}>
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">Reference Image URLs</label>
            <textarea className="input text-sm font-mono" rows={2}
              placeholder="https://.../ref-1.png&#10;https://.../ref-2.png"
              {...register("reference_image_urls")} />
            <p className="text-[10px] text-slate-500 mt-0.5">
              Mỗi URL một dòng. Để trống = text-to-image.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium">Reference Video URLs</label>
            <textarea className="input text-sm font-mono" rows={2}
              placeholder="https://.../sample.mp4" {...register("reference_video_urls")} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <button type="submit" disabled={execute.isPending} className="btn-primary inline-flex items-center gap-1.5">
                {execute.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {execute.isPending ? "Đang chạy..." : "Execute"}
              </button>
              <button
                type="button"
                disabled={submitAsync.isPending}
                onClick={handleSubmit((v) => submitAsync.mutate(v))}
                className="btn-ghost inline-flex items-center gap-1.5"
                title="Async — trả gw_id ngay, status update sau"
              >
                {submitAsync.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Submit Async
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                value={statusGwId}
                onChange={(e) => setStatusGwId(e.target.value)}
                placeholder="gw_id..."
                className="input text-xs font-mono w-32"
              />
              <button
                type="button"
                disabled={!statusGwId || checkStatus.isPending}
                onClick={() => checkStatus.mutate(statusGwId)}
                className="btn-ghost text-xs"
              >
                Check Status
              </button>
            </div>
          </div>
        </form>

        {/* Result */}
        <div className="card space-y-2">
          <h2 className="font-semibold">Execute Result</h2>
          {!response ? (
            <p className="text-slate-400 text-sm">Chưa có request nào.</p>
          ) : (
            <>
              <div className={`border rounded p-2 text-sm ${response.status === "succeeded" ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                <div className="flex items-center gap-2 mb-1">
                  {response.status === "succeeded"
                    ? <CheckCircle2 size={14} className="text-emerald-600" />
                    : <AlertCircle size={14} className="text-rose-600" />}
                  <strong>{response.status}</strong>
                  <span className="text-xs text-slate-500 font-mono ml-auto">{response.gw_id}</span>
                </div>
                {response.pool_key_name && (
                  <div className="text-xs text-slate-600">Pool key: {response.pool_key_name}</div>
                )}
                {response.error_message && (
                  <div className="text-xs text-rose-600 mt-1">{response.error_message}</div>
                )}
              </div>

              {/* Generated media — show inline if vendor returned data URLs */}
              {response.response?.media_urls?.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {response.response.media_urls.map((url: string, i: number) => (
                    <img
                      key={i}
                      src={url}
                      alt={`output ${i + 1}`}
                      className="w-full rounded border border-slate-200"
                    />
                  ))}
                </div>
              )}

              {/* Text content (if any) */}
              {response.response?.text && (
                <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs whitespace-pre-wrap max-h-40 overflow-auto">
                  {response.response.text}
                </div>
              )}

              <details>
                <summary className="text-xs text-slate-500 cursor-pointer">Xem raw JSON</summary>
                <pre className="bg-slate-900 text-emerald-300 p-2 rounded text-[10px] whitespace-pre-wrap overflow-auto max-h-80 font-mono mt-1">
                  {JSON.stringify(response.response, null, 2)}
                </pre>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
