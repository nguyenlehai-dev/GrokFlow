import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { GitBranch, Plus, Pencil, Trash2 } from "lucide-react";
import { gatewayApi } from "@/core/api/gateway";
import { toast } from "@/components/ui/Toast";
import { GatewayAuthGuard } from "./GatewayAuthGuard";
import { ErrorPanel, extractError } from "./GatewayProfilesPage";

interface Proxy {
  id: string;
  name: string;
  server: string;
  port: number;
  username: string | null;
  password: string | null;
  kind: string;
  country: string | null;
  sticky_session: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function GatewayProxiesPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Proxy | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: proxies, isLoading, error } = useQuery({
    queryKey: ["gw-proxies"],
    queryFn: async () => (await gatewayApi.get<Proxy[]>("/api/proxies")).data,
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => gatewayApi.delete(`/api/proxies/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-proxies"] });
      toast("Đã xóa proxy", "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <GitBranch size={22} /> Gateway — Proxies
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> Tạo proxy
        </button>
      </div>

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
                <th className="px-3 py-2">Server</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2">Sticky</th>
                <th className="px-3 py-2">Enabled</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(proxies ?? []).map((p) => (
                <tr key={p.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.server}:{p.port}</td>
                  <td className="px-3 py-2">{p.kind}</td>
                  <td className="px-3 py-2">{p.country ?? "—"}</td>
                  <td className="px-3 py-2">{p.sticky_session ? "✓" : "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${p.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {p.enabled ? "on" : "off"}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button className="btn-ghost" onClick={() => setEditing(p)}>
                      <Pencil size={14} className="inline mr-1" /> Sửa
                    </button>
                    <button
                      className="btn-ghost text-rose-600"
                      onClick={() => confirm(`Xóa ${p.name}?`) && remove.mutate(p.id)}
                    >
                      <Trash2 size={14} className="inline mr-1" /> Xóa
                    </button>
                  </td>
                </tr>
              ))}
              {(proxies ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Chưa có proxy nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <ProxyEditorModal
          proxy={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function ProxyEditorModal({
  proxy, isCreate, onClose,
}: { proxy: Proxy | null; isCreate: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: proxy?.name ?? "",
      server: proxy?.server ?? "",
      port: proxy?.port ?? 8080,
      username: proxy?.username ?? "",
      password: proxy?.password ?? "",
      kind: proxy?.kind ?? "http",
      country: proxy?.country ?? "",
      sticky_session: proxy?.sticky_session ?? false,
      enabled: proxy?.enabled ?? true,
    },
  });

  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        server: v.server,
        port: Number(v.port),
        username: v.username || null,
        password: v.password || null,
        kind: v.kind,
        country: v.country || null,
        sticky_session: v.sticky_session,
        enabled: v.enabled,
      };
      return isCreate
        ? gatewayApi.post("/api/proxies", payload)
        : gatewayApi.put(`/api/proxies/${proxy!.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-proxies"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm animate-fade-in p-4">
      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3"
      >
        <h2 className="text-lg font-semibold">{isCreate ? "Tạo proxy" : `Sửa: ${proxy?.name}`}</h2>

        <div>
          <label className="text-sm font-medium">Name</label>
          <input className="input" {...register("name", { required: true })} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="text-sm font-medium">Server</label>
            <input className="input font-mono" {...register("server", { required: true })}
              placeholder="proxy.example.com" />
          </div>
          <div>
            <label className="text-sm font-medium">Port</label>
            <input className="input" type="number" {...register("port", { valueAsNumber: true })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Username</label>
            <input className="input" {...register("username")} />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <input className="input" type="password" {...register("password")} />
          </div>
          <div>
            <label className="text-sm font-medium">Kind</label>
            <select className="input" {...register("kind")}>
              <option value="http">http</option>
              <option value="https">https</option>
              <option value="socks5">socks5</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Country</label>
            <input className="input" {...register("country")} placeholder="VN, US..." />
          </div>
        </div>

        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" {...register("sticky_session")} />
            Sticky session
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" {...register("enabled")} />
            Enabled
          </label>
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
