import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Key, Plus, Pencil, Trash2, Copy, Check, AlertCircle } from "lucide-react";
import { gwApi, extractError } from "./common";
import { toast } from "@/components/ui/Toast";

interface GwKey {
  id: string;
  label: string;
  prefix: string;
  allowed_functions: string[];
  status: string;
  webhook_url: string | null;
  rate_limit_per_minute: number;
  daily_quota: number;
  used_today: number;
  created_at: string;
}

interface GwKeyCreated extends GwKey {
  plain_key: string;
}

interface Func { id: string; code: string; name: string; }

export function GatewayKeysPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<GwKey | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<GwKeyCreated | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["gw-gateway-keys"],
    queryFn: async () => (await gwApi.get<GwKey[]>("/api/v1/gateway/gateway-keys")).data,
  });
  const { data: functions } = useQuery({
    queryKey: ["gw-functions"],
    queryFn: async () => (await gwApi.get<Func[]>("/api/v1/gateway/functions")).data,
  });

  const remove = useMutation({
    mutationFn: (id: string) => gwApi.delete(`/api/v1/gateway/gateway-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-gateway-keys"] });
      toast("Đã revoke key", "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Key size={22} /> Gateway — Gateway Keys
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> Issue Key
        </button>
      </div>

      {createdKey && <CreatedAlert created={createdKey} onClose={() => setCreatedKey(null)} />}

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Prefix</th>
                <th className="px-3 py-2">Functions</th>
                <th className="px-3 py-2">Rate / min</th>
                <th className="px-3 py-2">Daily</th>
                <th className="px-3 py-2">Webhook</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((k) => (
                <tr key={k.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{k.label}</td>
                  <td className="px-3 py-2 font-mono text-xs">{k.prefix}…</td>
                  <td className="px-3 py-2 text-xs">{k.allowed_functions.length ? k.allowed_functions.join(", ") : "all"}</td>
                  <td className="px-3 py-2 font-mono">{k.rate_limit_per_minute}</td>
                  <td className="px-3 py-2 font-mono">{k.used_today}/{k.daily_quota || "∞"}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 max-w-xs truncate">
                    {k.webhook_url ? <span className="text-emerald-700">✓</span> : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${k.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {k.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button onClick={() => setEditing(k)} className="btn-ghost text-xs">
                      <Pencil size={12} className="inline mr-1" /> Sửa
                    </button>
                    <button
                      onClick={() => confirm(`Revoke key "${k.label}"?`) && remove.mutate(k.id)}
                      className="btn-ghost text-rose-600 text-xs"
                    >
                      <Trash2 size={12} className="inline mr-1" /> Revoke
                    </button>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Chưa có gateway key. Click "Issue Key" để tạo.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <EditorModal
          k={editing}
          isCreate={creating}
          functions={functions ?? []}
          onClose={() => { setEditing(null); setCreating(false); }}
          onCreated={(created) => { setCreatedKey(created); setCreating(false); }}
        />
      )}
    </div>
  );
}

function CreatedAlert({ created, onClose }: { created: GwKeyCreated; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card border-amber-300 bg-amber-50">
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold">Key "{created.label}" đã tạo</h3>
          <p className="text-sm text-slate-700 mt-1">
            Lưu plain key NGAY — backend chỉ show 1 lần duy nhất:
          </p>
          <div className="mt-2 flex items-center gap-2 bg-slate-900 text-emerald-400 font-mono text-xs px-3 py-2 rounded">
            <code className="flex-1 truncate">{created.plain_key}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(created.plain_key);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="p-1 rounded hover:bg-slate-700 text-slate-300"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <button onClick={onClose} className="btn-ghost text-xs mt-2">Đã lưu, ẩn đi</button>
        </div>
      </div>
    </div>
  );
}

function EditorModal({
  k, isCreate, functions, onClose, onCreated,
}: {
  k: GwKey | null;
  isCreate: boolean;
  functions: Func[];
  onClose: () => void;
  onCreated: (k: GwKeyCreated) => void;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      label: k?.label ?? "",
      allowed_functions: (k?.allowed_functions ?? []).join(", "),
      webhook_url: k?.webhook_url ?? "",
      rate_limit_per_minute: k?.rate_limit_per_minute ?? 60,
      daily_quota: k?.daily_quota ?? 0,
      status: k?.status ?? "active",
    },
  });
  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        label: v.label,
        allowed_functions: v.allowed_functions
          ? v.allowed_functions.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [],
        webhook_url: v.webhook_url || null,
        rate_limit_per_minute: Number(v.rate_limit_per_minute),
        daily_quota: Number(v.daily_quota),
        status: v.status,
      };
      if (isCreate) {
        const { data } = await gwApi.post<GwKeyCreated>("/api/v1/gateway/gateway-keys", payload);
        return data;
      }
      return (await gwApi.patch<GwKey>(`/api/v1/gateway/gateway-keys/${k!.id}`, payload)).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["gw-gateway-keys"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      if (isCreate && "plain_key" in (data as any)) {
        onCreated(data as GwKeyCreated);
      } else {
        onClose();
      }
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">{isCreate ? "Issue gateway key" : `Sửa: ${k?.label}`}</h2>

        <div>
          <label className="text-sm font-medium">Label</label>
          <input className="input" {...register("label", { required: true })} />
        </div>

        <div>
          <label className="text-sm font-medium">Allowed functions (codes, comma)</label>
          <input className="input font-mono text-xs" {...register("allowed_functions")}
            placeholder="image_generation, text_generation" />
          <p className="text-[10px] text-slate-500 mt-0.5">
            Để trống = mọi function. Available: {functions.map((f) => f.code).join(", ")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-medium">Rate / min</label>
            <input className="input" type="number" min={1} max={10000}
              {...register("rate_limit_per_minute", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="text-sm font-medium">Daily quota (0=∞)</label>
            <input className="input" type="number" min={0}
              {...register("daily_quota", { valueAsNumber: true })} />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Webhook URL (async submit callback)</label>
          <input className="input font-mono text-xs" {...register("webhook_url")}
            placeholder="https://your.app/gateway-webhook" />
        </div>

        {!isCreate && (
          <div>
            <label className="text-sm font-medium">Status</label>
            <select className="input" {...register("status")}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? "Đang lưu..." : isCreate ? "Issue" : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}
