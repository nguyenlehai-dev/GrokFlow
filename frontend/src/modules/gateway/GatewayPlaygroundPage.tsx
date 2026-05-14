import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Terminal, Play, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import axios from "axios";
import { gwApi, extractError } from "./common";
import { toast } from "@/components/ui/Toast";
import { useAuthStore } from "@/core/auth/store";
import { usePlaygroundKey } from "./playgroundKeyStore";
import { PlaygroundLockModal, SystemAuthIndicator } from "./PlaygroundLockModal";

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
  const me = useAuthStore((s) => s.user);
  // Only super_admin bypasses the Gateway-API-Key gate. Per-domain admin
  // still needs to verify a gwk_live_* key — they're managing a tenant,
  // not the global gateway, so they go through the same client auth path
  // as any external caller. Matches the plxeditor design.
  const isSuper = me?.role === "super_admin";
  const verified = usePlaygroundKey((s) => s.current);
  const unlocked = isSuper || !!verified;
  // `isAdmin` here means "JWT-routed admin path inside the playground form",
  // which is super_admin only now.
  const isAdmin = isSuper;

  return (
    <div className="space-y-4 relative">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title flex items-center gap-2">
          <Terminal size={22} /> Gateway — Playground
        </h1>
        <SystemAuthIndicator isAdmin={isAdmin} />
      </div>

      {/* The form stays mounted (so toggling auth status preserves field state),
          but gets greyed + non-interactive when locked. */}
      <div className={unlocked ? "" : "pointer-events-none opacity-40 select-none"}>
        <PlaygroundBody isAdmin={isAdmin} gatewayKey={verified?.key ?? null} />
      </div>

      {!unlocked && <PlaygroundLockModal />}
    </div>
  );
}

function PlaygroundBody({
  isAdmin, gatewayKey,
}: { isAdmin: boolean; gatewayKey: string | null }) {
  const [response, setResponse] = useState<ExecuteResp | null>(null);

  // Admin uses gwApi (GrokFlow JWT routed through proxy-style endpoints on
  // the same backend). Non-admin uses the Gateway API Key directly — we
  // build a one-off axios call so the JWT interceptor doesn't add its
  // own Authorization header on top.
  const callGateway = async <T,>(
    method: "GET" | "POST",
    path: string,
    body?: any,
  ): Promise<{ data: T }> => {
    if (isAdmin) {
      return method === "GET"
        ? gwApi.get<T>(path)
        : gwApi.post<T>(path, body);
    }
    return axios.request<T>({
      method,
      url: path,           // same-origin
      data: body,
      headers: {
        Authorization: `Bearer ${gatewayKey}`,
        "Content-Type": "application/json",
      },
    });
  };

  // Vendor / function / pool dropdowns only work for admin — the auth on those
  // CRUD endpoints requires admin role. Non-admin still gets a usable form:
  // they type the function code + model by hand. Both flows hit the same
  // /functions/{code}/execute under the hood.
  const { data: vendors } = useQuery({
    queryKey: ["gw-vendors"],
    queryFn: async () => (await gwApi.get<Vendor[]>("/api/v1/gateway/vendors")).data,
    enabled: isAdmin,
  });
  const { data: functions } = useQuery({
    queryKey: ["gw-functions"],
    queryFn: async () => (await gwApi.get<Func[]>("/api/v1/gateway/functions")).data,
    enabled: isAdmin,
  });
  const { data: pools } = useQuery({
    queryKey: ["gw-pools"],
    queryFn: async () => (await gwApi.get<Pool[]>("/api/v1/gateway/pools")).data,
    enabled: isAdmin,
  });

  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      vendor_id: "",
      function_id: "",
      function_code: "image_generation",
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
  const effectiveFnCode = isAdmin
    ? (selectedFn?.code || watch("function_code"))
    : watch("function_code");

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
      if (!effectiveFnCode) throw new Error("Chọn function");
      const r = await callGateway<ExecuteResp>(
        "POST",
        `/api/v1/gateway/functions/${effectiveFnCode}/execute`,
        buildPayload(v),
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
      if (!effectiveFnCode) throw new Error("Chọn function");
      const r = await callGateway<ExecuteResp>(
        "POST",
        `/api/v1/gateway/functions/${effectiveFnCode}/submit`,
        buildPayload(v),
      );
      return r.data;
    },
    onSuccess: (data) => {
      setResponse(data);
      setStatusGwId(data.gw_id);
      toast(`Submitted: ${data.gw_id}`, "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  const checkStatus = useMutation({
    mutationFn: async (gwId: string) =>
      (await callGateway<ExecuteResp & { status: string }>(
        "GET",
        `/api/v1/gateway/requests/${gwId}/status`,
      )).data,
    onSuccess: (data) => {
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
    <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
      {/* Form */}
      <form
        onSubmit={handleSubmit((v) => execute.mutate(v))}
        className="card space-y-3"
      >
        <h2 className="font-semibold">Playground</h2>

        {isAdmin ? (
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
              <select
                className="input text-sm"
                {...register("function_id")}
                onChange={(e) => {
                  setValue("function_id", e.target.value);
                  const f = functions?.find((x) => x.id === e.target.value);
                  if (f) setValue("function_code", f.code);
                }}
              >
                <option value="">— chọn —</option>
                {(functions ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs font-medium">Function code</label>
            <input
              className="input text-sm font-mono"
              placeholder="image_generation"
              {...register("function_code", { required: true })}
            />
            <p className="text-[10px] text-ink-400 mt-0.5">
              Code của API function admin đã setup (vd: image_generation, text_generation).
            </p>
          </div>
        )}

        <div>
          <label className="text-xs font-medium">Model</label>
          <input className="input text-sm font-mono" placeholder="(để trống = dùng pool default)" {...register("model")} />
        </div>

        <div>
          <label className="text-xs font-medium">Prompt</label>
          <textarea className="input" rows={3} placeholder="Prompt..." {...register("prompt", { required: true })} />
        </div>

        {(selectedFn?.function_type === "image" || effectiveFnCode === "image_generation") && (
          <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
            <strong className="text-blue-700">Image Generation</strong>
            <p className="text-xs text-ink-300 mt-0.5">
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
          <label className="text-xs font-medium">Reference Images — Upload</label>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              if (!files.length) return;
              const urls: string[] = [];
              for (const f of files) {
                try {
                  const fd = new FormData();
                  fd.append("file", f);
                  const r = isAdmin
                    ? await gwApi.post<{ url: string }>("/api/v1/gateway/uploads", fd, {
                        headers: { "Content-Type": "multipart/form-data" },
                      })
                    : await axios.post<{ url: string }>("/api/v1/gateway/uploads", fd, {
                        headers: {
                          Authorization: `Bearer ${gatewayKey}`,
                          "Content-Type": "multipart/form-data",
                        },
                      });
                  urls.push(r.data.url);
                } catch (err: any) {
                  toast(extractError(err), "error");
                }
              }
              const ta = document.querySelector<HTMLTextAreaElement>("#refImgUrls");
              if (ta && urls.length) {
                const existing = ta.value.trim();
                ta.value = existing ? existing + "\n" + urls.join("\n") : urls.join("\n");
                ta.dispatchEvent(new Event("input", { bubbles: true }));
                toast(`Đã upload ${urls.length} file`, "success");
              }
              e.target.value = "";
            }}
            className="block w-full text-xs file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-brand-50 file:text-brand-700 file:cursor-pointer"
          />
        </div>

        <div>
          <label className="text-xs font-medium">Reference Image URLs</label>
          <textarea
            id="refImgUrls"
            className="input text-sm font-mono"
            rows={2}
            placeholder="https://.../ref-1.png&#10;https://.../ref-2.png"
            {...register("reference_image_urls")}
          />
          <p className="text-[10px] text-ink-400 mt-0.5">
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
          <p className="text-ink-500 text-sm">Chưa có request nào.</p>
        ) : (
          <>
            <div className={`border rounded p-2 text-sm ${response.status === "succeeded" ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
              <div className="flex items-center gap-2 mb-1">
                {response.status === "succeeded"
                  ? <CheckCircle2 size={14} className="text-emerald-600" />
                  : <AlertCircle size={14} className="text-rose-600" />}
                <strong>{response.status}</strong>
                <span className="text-xs text-ink-400 font-mono ml-auto">{response.gw_id}</span>
              </div>
              {response.pool_key_name && (
                <div className="text-xs text-ink-300">Pool key: {response.pool_key_name}</div>
              )}
              {response.error_message && (
                <div className="text-xs text-rose-600 mt-1">{response.error_message}</div>
              )}
            </div>

            {response.response?.media_urls?.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {response.response.media_urls.map((url: string, i: number) => (
                  <img
                    key={i}
                    src={url}
                    alt={`output ${i + 1}`}
                    className="w-full rounded border border-ink-800"
                  />
                ))}
              </div>
            )}

            {response.response?.text && (
              <div className="rounded border border-ink-800 bg-ink-900 p-2 text-xs whitespace-pre-wrap max-h-40 overflow-auto">
                {response.response.text}
              </div>
            )}

            <details>
              <summary className="text-xs text-ink-400 cursor-pointer">Xem raw JSON</summary>
              <pre className="bg-slate-900 text-emerald-300 p-2 rounded text-[10px] whitespace-pre-wrap overflow-auto max-h-80 font-mono mt-1">
                {JSON.stringify(response.response, null, 2)}
              </pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
