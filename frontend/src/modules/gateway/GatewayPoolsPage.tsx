import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { GitBranch, Plus, Pencil, Trash2, Key, X } from "lucide-react";
import { gwApi, extractError } from "./common";
import { toast } from "@/components/ui/Toast";

interface Vendor { id: string; name: string; code: string; }
interface Func { id: string; code: string; name: string; }
interface Pool {
  id: string;
  vendor_id: string;
  vendor_name: string;
  function_id: string | null;
  function_name: string | null;
  code: string;
  name: string;
  model: string | null;
  description: string | null;
  status: string;
  keys_total: number;
  keys_active: number;
}
interface PoolKey {
  id: string;
  pool_id: string;
  name: string;
  key_prefix: string;
  project_id: string | null;
  priority: number;
  status: string;
  used_count: number;
  last_used_at: string | null;
  created_at: string;
}

export function GatewayPoolsPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Pool | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: pools, isLoading } = useQuery({
    queryKey: ["gw-pools"],
    queryFn: async () => (await gwApi.get<Pool[]>("/api/v1/gateway/pools")).data,
  });
  const { data: vendors } = useQuery({
    queryKey: ["gw-vendors"],
    queryFn: async () => (await gwApi.get<Vendor[]>("/api/v1/gateway/vendors")).data,
  });
  const { data: functions } = useQuery({
    queryKey: ["gw-functions"],
    queryFn: async () => (await gwApi.get<Func[]>("/api/v1/gateway/functions")).data,
  });

  const remove = useMutation({
    mutationFn: (id: string) => gwApi.delete(`/api/v1/gateway/pools/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-pools"] });
      toast("Đã xóa pool", "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <GitBranch size={22} /> Gateway — Pools
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> Create Pool
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr_1fr] gap-4">
        {/* Left: pool list */}
        <div className="card space-y-2">
          <h2 className="font-semibold">Pools</h2>
          {isLoading ? (
            <p className="text-ink-400 text-sm">Đang tải...</p>
          ) : (pools ?? []).length === 0 ? (
            <p className="text-ink-400 text-sm">Chưa có pool nào.</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {pools!.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  className={`w-full text-left border rounded p-2 transition ${
                    activeId === p.id
                      ? "border-brand-500 bg-brand-50"
                      : "border-ink-800 hover:bg-ink-900"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate">{p.name}</strong>
                    <span className={`text-xs px-2 py-0.5 rounded ${p.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-ink-800 text-ink-400"}`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="text-xs text-ink-400 mt-0.5">
                    {p.vendor_name} · {p.function_name ?? "—"}
                  </div>
                  <div className="text-xs text-ink-400 font-mono">
                    {p.model ?? "no model"} · keys: {p.keys_active}/{p.keys_total}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Middle: keys inside selected pool */}
        <div className="card space-y-2">
          <h2 className="font-semibold flex items-center gap-1.5">
            <Key size={14} /> API Keys In Pool
          </h2>
          {activeId ? (
            <PoolKeysPanel poolId={activeId} />
          ) : (
            <p className="text-ink-400 text-sm">Chọn pool bên trái để xem/thêm API keys.</p>
          )}
        </div>

        {/* Right: overview/actions */}
        <div className="card space-y-2">
          <h2 className="font-semibold">Pool Overview</h2>
          {pools && pools.length > 0 ? (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {pools.map((p) => (
                <div key={p.id} className="border border-ink-800 rounded p-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{p.name}</strong>
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(p)} className="btn-ghost text-xs" title="Sửa">
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => confirm(`Xóa pool ${p.name}?`) && remove.mutate(p.id)}
                        className="btn-ghost text-rose-600 text-xs"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-ink-400 mt-1">{p.vendor_name}</div>
                  <div className="text-xs">Model: <span className="font-mono">{p.model ?? "n/a"}</span></div>
                  <div className="text-xs">API Keys: {p.keys_active}/{p.keys_total}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-ink-400 text-sm">Chưa có pool.</p>
          )}
        </div>
      </div>

      {(editing || creating) && (
        <PoolEditorModal
          pool={editing}
          isCreate={creating}
          vendors={vendors ?? []}
          functions={functions ?? []}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function PoolKeysPanel({ poolId }: { poolId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["gw-pool-keys", poolId],
    queryFn: async () =>
      (await gwApi.get<PoolKey[]>(`/api/v1/gateway/pools/${poolId}/keys`)).data,
  });

  const remove = useMutation({
    mutationFn: (kid: string) => gwApi.delete(`/api/v1/gateway/pools/${poolId}/keys/${kid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-pool-keys", poolId] });
      qc.invalidateQueries({ queryKey: ["gw-pools"] });
      toast("Đã xóa key", "success");
    },
  });

  return (
    <div className="space-y-3">
      {creating && (
        <AddKeyForm poolId={poolId} onDone={() => {
          qc.invalidateQueries({ queryKey: ["gw-pool-keys", poolId] });
          qc.invalidateQueries({ queryKey: ["gw-pools"] });
          setCreating(false);
        }} />
      )}
      {!creating && (
        <button onClick={() => setCreating(true)} className="btn-primary w-full inline-flex items-center justify-center gap-1.5">
          <Plus size={14} /> Add API Key
        </button>
      )}
      {isLoading ? (
        <p className="text-ink-400 text-sm">Đang tải...</p>
      ) : (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {(keys ?? []).map((k) => (
            <div key={k.id} className="border border-ink-800 rounded p-2">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">{k.name}</strong>
                <span className={`text-xs px-2 py-0.5 rounded ${k.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-ink-800 text-ink-400"}`}>
                  {k.status}
                </span>
              </div>
              <div className="text-xs text-ink-400 font-mono">
                {k.key_prefix}… {k.project_id && `· ${k.project_id}`}
              </div>
              <div className="text-xs text-ink-400 flex items-center justify-between mt-1">
                <span>Priority {k.priority} · {k.used_count} calls</span>
                <button
                  onClick={() => confirm(`Xóa key ${k.name}?`) && remove.mutate(k.id)}
                  className="text-rose-600 hover:underline"
                >
                  <X size={12} className="inline" /> Remove
                </button>
              </div>
            </div>
          ))}
          {(keys ?? []).length === 0 && (
            <p className="text-ink-500 text-xs text-center py-2">Chưa có key.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AddKeyForm({ poolId, onDone }: { poolId: string; onDone: () => void }) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { name: "", api_key: "", project_id: "", priority: 100 },
  });
  const save = useMutation({
    mutationFn: (v: any) => gwApi.post(`/api/v1/gateway/pools/${poolId}/keys`, v),
    onSuccess: () => {
      toast("Đã thêm key", "success");
      reset();
      onDone();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });
  return (
    <form onSubmit={handleSubmit((v) => save.mutate({ ...v, priority: Number(v.priority) }))} className="space-y-2 p-2 border border-ink-800 rounded bg-ink-900">
      <input className="input text-sm" placeholder="Name (Gemini Key 01)" {...register("name", { required: true })} />
      <input className="input text-sm font-mono" placeholder="API key" type="password" {...register("api_key", { required: true })} />
      <div className="grid grid-cols-2 gap-2">
        <input className="input text-sm" placeholder="Project ID (optional)" {...register("project_id")} />
        <input className="input text-sm" placeholder="Priority" type="number" {...register("priority", { valueAsNumber: true })} />
      </div>
      <button type="submit" disabled={save.isPending} className="btn-primary text-sm w-full">
        {save.isPending ? "Đang lưu..." : "Add API Key"}
      </button>
    </form>
  );
}

function PoolEditorModal({
  pool, isCreate, vendors, functions, onClose,
}: {
  pool: Pool | null; isCreate: boolean;
  vendors: Vendor[]; functions: Func[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      vendor_id: pool?.vendor_id ?? "",
      function_id: pool?.function_id ?? "",
      code: pool?.code ?? "",
      name: pool?.name ?? "",
      model: pool?.model ?? "",
      description: pool?.description ?? "",
      status: pool?.status ?? "active",
      cooldown_seconds: (pool as any)?.cooldown_seconds ?? 300,
      cost_per_million_input_cents: (pool as any)?.cost_per_million_input_cents ?? 0,
      cost_per_million_output_cents: (pool as any)?.cost_per_million_output_cents ?? 0,
    },
  });
  const save = useMutation({
    mutationFn: (v: any) => {
      const payload = {
        ...v,
        function_id: v.function_id || null,
        cooldown_seconds: Number(v.cooldown_seconds),
        cost_per_million_input_cents: Number(v.cost_per_million_input_cents),
        cost_per_million_output_cents: Number(v.cost_per_million_output_cents),
      };
      return isCreate
        ? gwApi.post("/api/v1/gateway/pools", payload)
        : gwApi.patch(`/api/v1/gateway/pools/${pool!.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-pools"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm animate-fade-in p-4">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="w-full max-w-md rounded-lg bg-ink-900 p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">{isCreate ? "Tạo pool" : `Sửa: ${pool?.name}`}</h2>
        <div>
          <label className="text-sm font-medium">Vendor</label>
          <select className="input" {...register("vendor_id", { required: true })} disabled={!isCreate}>
            <option value="">— chọn vendor —</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">API Function</label>
          <select className="input" {...register("function_id")}>
            <option value="">— không gắn —</option>
            {functions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-medium">Name</label>
            <input className="input" {...register("name", { required: true })} />
          </div>
          <div>
            <label className="text-sm font-medium">Code</label>
            <input className="input font-mono" {...register("code", { required: true })} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Model</label>
          <input className="input font-mono" {...register("model")} placeholder="gemini-2.5-flash" />
        </div>
        <div>
          <label className="text-sm font-medium">Description</label>
          <textarea className="input" rows={2} {...register("description")} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-medium">Status</label>
            <select className="input" {...register("status")}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Cooldown (s)</label>
            <input className="input" type="number" min={10} max={86400}
              {...register("cooldown_seconds", { valueAsNumber: true })} />
            <p className="text-[10px] text-ink-400 mt-0.5">
              Khi key 429, ngừng dùng trong N giây rồi tự thử lại.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t pt-3">
          <div>
            <label className="text-sm font-medium">Cost / 1M input tokens (¢)</label>
            <input className="input" type="number" min={0}
              {...register("cost_per_million_input_cents", { valueAsNumber: true })} />
            <p className="text-[10px] text-ink-400 mt-0.5">
              VD Gemini Flash: 7 (=$0.07/M)
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Cost / 1M output tokens (¢)</label>
            <input className="input" type="number" min={0}
              {...register("cost_per_million_output_cents", { valueAsNumber: true })} />
            <p className="text-[10px] text-ink-400 mt-0.5">
              VD Gemini Flash: 30 (=$0.30/M)
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? "Đang lưu..." : isCreate ? "Tạo" : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}
