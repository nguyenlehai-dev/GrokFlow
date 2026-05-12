import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Code2, Plus, Pencil, Trash2 } from "lucide-react";
import { gwApi, extractError } from "./common";
import { toast } from "@/components/ui/Toast";

interface Func {
  id: string;
  code: string;
  name: string;
  function_type: string;
  description: string | null;
  status: string;
  created_at: string;
}

export function GatewayFunctionsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Func | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["gw-functions"],
    queryFn: async () => (await gwApi.get<Func[]>("/api/v1/gateway/functions")).data,
  });

  const remove = useMutation({
    mutationFn: (id: string) => gwApi.delete(`/api/v1/gateway/functions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-functions"] });
      toast("Đã xóa function", "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Code2 size={22} /> Gateway — API Functions
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> Create Function
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((f) => (
                <tr key={f.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{f.code}</td>
                  <td className="px-3 py-2 font-medium">{f.name}</td>
                  <td className="px-3 py-2">{f.function_type}</td>
                  <td className="px-3 py-2 text-slate-600">{f.description ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${f.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {f.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button onClick={() => setEditing(f)} className="btn-ghost text-xs">
                      <Pencil size={12} className="inline mr-1" /> Sửa
                    </button>
                    <button
                      onClick={() => confirm(`Xóa function ${f.name}?`) && remove.mutate(f.id)}
                      className="btn-ghost text-rose-600 text-xs"
                    >
                      <Trash2 size={12} className="inline mr-1" /> Xóa
                    </button>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Chưa có function.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <Editor func={editing} isCreate={creating} onClose={() => { setEditing(null); setCreating(false); }} />
      )}
    </div>
  );
}

function Editor({ func, isCreate, onClose }: { func: Func | null; isCreate: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      code: func?.code ?? "",
      name: func?.name ?? "",
      function_type: func?.function_type ?? "image",
      description: func?.description ?? "",
      status: func?.status ?? "active",
    },
  });
  const save = useMutation({
    mutationFn: (v: any) =>
      isCreate
        ? gwApi.post("/api/v1/gateway/functions", v)
        : gwApi.patch(`/api/v1/gateway/functions/${func!.id}`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-functions"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">{isCreate ? "Tạo function" : `Sửa: ${func?.name}`}</h2>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-medium">Code</label>
            <input className="input font-mono" {...register("code", { required: true })} disabled={!isCreate} />
          </div>
          <div>
            <label className="text-sm font-medium">Type</label>
            <select className="input" {...register("function_type")}>
              <option value="image">image</option>
              <option value="video">video</option>
              <option value="text">text</option>
              <option value="audio">audio</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Name</label>
          <input className="input" {...register("name", { required: true })} />
        </div>
        <div>
          <label className="text-sm font-medium">Description</label>
          <textarea className="input" rows={2} {...register("description")} />
        </div>
        <div>
          <label className="text-sm font-medium">Status</label>
          <select className="input" {...register("status")}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
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
