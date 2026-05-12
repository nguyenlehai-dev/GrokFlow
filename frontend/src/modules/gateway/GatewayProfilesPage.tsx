import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Layers, Plus, Pencil, Trash2, AlertCircle } from "lucide-react";
import { gatewayApi } from "@/core/api/gateway";
import { toast } from "@/components/ui/Toast";
import { GatewayAuthGuard } from "./GatewayAuthGuard";

interface AntidetectConfig {
  user_agent?: string | null;
  locale?: string | null;
  timezone_id?: string | null;
  color_scheme?: string | null;
  viewport_width?: number | null;
  viewport_height?: number | null;
  platform?: string | null;
  hardware_concurrency?: number | null;
}

interface Profile {
  id: string;
  name: string;
  category: string;
  description: string | null;
  is_active: boolean;
  proxy_id: string | null;
  tags: string[];
  antidetect: AntidetectConfig | null;
  concurrency_limit: number;
  cookie_file: string | null;
  cache_dir: string;
  user_data_dir: string;
  created_at: string;
  updated_at: string;
}

export function GatewayProfilesPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: profiles, isLoading, error } = useQuery({
    queryKey: ["gw-profiles"],
    queryFn: async () => (await gatewayApi.get<Profile[]>("/api/profiles")).data,
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => gatewayApi.delete(`/api/profiles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-profiles"] });
      toast("Đã xóa profile", "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Layers size={22} /> Gateway — Profiles
        </h1>
        <button
          onClick={() => setCreating(true)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> Tạo profile
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : error ? (
        <ErrorPanel error={error} />
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Concurrency</th>
                <th className="px-3 py-2">Tags</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(profiles ?? []).map((p) => (
                <tr key={p.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{p.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p.category}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {p.is_active ? "active" : "off"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{p.concurrency_limit}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {p.tags?.length ? p.tags.join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {new Date(p.created_at).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button className="btn-ghost" onClick={() => setEditing(p)}>
                      <Pencil size={14} className="inline mr-1" /> Sửa
                    </button>
                    <button
                      className="btn-ghost text-rose-600"
                      onClick={() => confirm(`Xóa profile ${p.name}?`) && remove.mutate(p.id)}
                    >
                      <Trash2 size={14} className="inline mr-1" /> Xóa
                    </button>
                  </td>
                </tr>
              ))}
              {(profiles ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Chưa có profile nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <ProfileEditorModal
          profile={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function ProfileEditorModal({
  profile, isCreate, onClose,
}: { profile: Profile | null; isCreate: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm<{
    name: string;
    category: string;
    description: string;
    is_active: boolean;
    concurrency_limit: number;
    tags: string;
  }>({
    defaultValues: {
      name: profile?.name ?? "",
      category: profile?.category ?? "grok",
      description: profile?.description ?? "",
      is_active: profile?.is_active ?? true,
      concurrency_limit: profile?.concurrency_limit ?? 1,
      tags: (profile?.tags ?? []).join(", "),
    },
  });

  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        category: v.category,
        description: v.description || null,
        is_active: v.is_active,
        concurrency_limit: Number(v.concurrency_limit),
        tags: v.tags ? v.tags.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
      };
      return isCreate
        ? gatewayApi.post("/api/profiles", payload)
        : gatewayApi.put(`/api/profiles/${profile!.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-profiles"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3"
      >
        <h2 className="text-lg font-semibold">
          {isCreate ? "Tạo profile" : `Sửa: ${profile?.name}`}
        </h2>

        <div>
          <label className="text-sm font-medium">Name</label>
          <input className="input" {...register("name", { required: true })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Category</label>
            <select className="input" {...register("category")} disabled={!isCreate}>
              <option value="grok">grok</option>
              <option value="flow">flow</option>
              <option value="dreamina">dreamina</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Concurrency</label>
            <input className="input" type="number" min={1} max={20}
              {...register("concurrency_limit", { valueAsNumber: true })} />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Tags (cách nhau bằng dấu phẩy)</label>
          <input className="input" {...register("tags")} placeholder="prod, vn, fast" />
        </div>

        <div>
          <label className="text-sm font-medium">Description</label>
          <textarea className="input" rows={2} {...register("description")} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("is_active")} />
          <span>Active</span>
        </label>

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

export function ErrorPanel({ error }: { error: any }) {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail ?? error?.message ?? "Lỗi không xác định";

  if (status === 401) {
    return (
      <div className="card border-amber-200 bg-amber-50/30">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-600 mt-0.5" />
          <div>
            <h2 className="font-semibold">Phiên gateway hết hạn</h2>
            <p className="text-sm text-slate-600 mt-1">
              Refresh trang để login lại.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card border-rose-200 bg-rose-50/30">
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className="text-rose-600 mt-0.5" />
        <div>
          <h2 className="font-semibold">Lỗi gọi gateway</h2>
          <p className="text-sm text-slate-600 mt-1">
            HTTP {status ?? "?"}: <code>{String(detail).slice(0, 200)}</code>
          </p>
        </div>
      </div>
    </div>
  );
}

export function extractError(e: any): string {
  return e?.response?.data?.detail ?? e?.response?.data?.message ?? e?.message ?? "Lỗi";
}
