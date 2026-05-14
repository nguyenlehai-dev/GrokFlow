import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Code2, Plus, Trash2, Copy, Check, AlertCircle } from "lucide-react";
import { gatewayApi } from "@/core/api/gateway";
import { toast } from "@/components/ui/Toast";
import { GatewayAuthGuard } from "./GatewayAuthGuard";
import { ErrorPanel, extractError } from "./GatewayProfilesPage";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  rate_limit_per_minute: number;
  is_active: boolean;
  allowed_categories: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ApiKeyCreated extends ApiKey {
  plain_key: string;
}

export function GatewayApiKeysPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);

  const { data: keys, isLoading, error } = useQuery({
    queryKey: ["gw-api-keys"],
    queryFn: async () => (await gatewayApi.get<ApiKey[]>("/api/api-keys")).data,
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => gatewayApi.delete(`/api/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-api-keys"] });
      toast("Đã xóa key", "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <Code2 size={22} /> Gateway — API Keys
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> Tạo API key
        </button>
      </div>

      {createdKey && (
        <CreatedKeyAlert created={createdKey} onClose={() => setCreatedKey(null)} />
      )}

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : error ? (
        <ErrorPanel error={error} />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Prefix</th>
                <th className="px-3 py-2">Rate limit / min</th>
                <th className="px-3 py-2">Categories</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(keys ?? []).map((k) => (
                <tr key={k.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{k.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{k.key_prefix}…</td>
                  <td className="px-3 py-2">{k.rate_limit_per_minute}</td>
                  <td className="px-3 py-2 text-xs">{k.allowed_categories.join(", ") || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${k.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {k.is_active ? "active" : "off"}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button
                      className="btn-ghost text-rose-600"
                      onClick={() => confirm(`Xóa key "${k.name}"?`) && remove.mutate(k.id)}
                    >
                      <Trash2 size={14} className="inline mr-1" /> Xóa
                    </button>
                  </td>
                </tr>
              ))}
              {(keys ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Chưa có API key nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={(key) => {
            setCreatedKey(key);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function CreateModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (k: ApiKeyCreated) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: "",
      rate_limit_per_minute: 60,
      allowed_categories: "grok",
      notes: "",
    },
  });

  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        rate_limit_per_minute: Number(v.rate_limit_per_minute),
        allowed_categories: v.allowed_categories
          ? v.allowed_categories.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [],
        notes: v.notes || null,
      };
      const { data } = await gatewayApi.post<ApiKeyCreated>("/api/api-keys", payload);
      return data;
    },
    onSuccess: (key) => {
      qc.invalidateQueries({ queryKey: ["gw-api-keys"] });
      onCreated(key);
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm animate-fade-in p-4">
      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3"
      >
        <h2 className="text-lg font-semibold">Tạo API key mới</h2>

        <div>
          <label className="text-sm font-medium">Name</label>
          <input className="input" {...register("name", { required: true })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Rate / min</label>
            <input className="input" type="number" min={1} max={10000}
              {...register("rate_limit_per_minute", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="text-sm font-medium">Categories</label>
            <input className="input" {...register("allowed_categories")}
              placeholder="grok, flow" />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Notes</label>
          <textarea className="input" rows={2} {...register("notes")} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? "Đang tạo..." : "Tạo"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreatedKeyAlert({
  created, onClose,
}: { created: ApiKeyCreated; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard.writeText(created.plain_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="card border-amber-300 bg-amber-50">
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold">Key "{created.name}" đã tạo</h3>
          <p className="text-sm text-slate-700 mt-1">
            Lưu key này NGAY — backend không show lại được:
          </p>
          <div className="mt-2 flex items-center gap-2 bg-slate-900 text-emerald-400 font-mono text-xs px-3 py-2 rounded">
            <code className="flex-1 truncate">{created.plain_key}</code>
            <button
              onClick={onCopy}
              className="p-1 rounded hover:bg-slate-700 text-slate-300"
              title="Copy"
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
