import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Boxes, Plus, Pencil, Trash2 } from "lucide-react";
import { gwApi, extractError } from "./common";
import { toast } from "@/components/ui/Toast";

interface Vendor {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  domain: string | null;
  description: string | null;
  status: string;
  created_at: string;
}

export function GatewayVendorsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["gw-vendors"],
    queryFn: async () => (await gwApi.get<Vendor[]>("/api/v1/gateway/vendors")).data,
  });

  const remove = useMutation({
    mutationFn: (id: string) => gwApi.delete(`/api/v1/gateway/vendors/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-vendors"] });
      toast("Đã xóa vendor", "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Boxes size={22} /> Gateway — Vendors
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> Create Vendor
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Form (full width on small) */}
        <div className="card space-y-3">
          <h2 className="font-semibold">Create Vendor</h2>
          <p className="text-xs text-slate-500">
            Click "Create Vendor" ở trên để mở modal, hoặc nhập trực tiếp ở đây.
          </p>
          <InlineCreateForm onDone={() => qc.invalidateQueries({ queryKey: ["gw-vendors"] })} />
        </div>

        {/* List */}
        <div className="card space-y-2">
          <h2 className="font-semibold">Vendor List</h2>
          {isLoading ? (
            <p className="text-slate-500 text-sm">Đang tải...</p>
          ) : (vendors ?? []).length === 0 ? (
            <p className="text-slate-500 text-sm">Chưa có vendor nào.</p>
          ) : (
            <div className="space-y-2">
              {vendors!.map((v) => (
                <div key={v.id} className="border border-slate-200 rounded p-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <strong>{v.name}</strong>
                        <span className={`text-xs px-2 py-0.5 rounded ${v.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {v.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {v.code} {v.short_name && `/ ${v.short_name}`}
                      </div>
                      {v.description && (
                        <p className="text-sm text-slate-600 mt-1">{v.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(v)} className="btn-ghost text-xs" title="Sửa">
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => confirm(`Xóa vendor ${v.name}?`) && remove.mutate(v.id)}
                        className="btn-ghost text-rose-600 text-xs"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(editing || creating) && (
        <VendorEditorModal
          vendor={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function InlineCreateForm({ onDone }: { onDone: () => void }) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { code: "", name: "", short_name: "", domain: "", description: "" },
  });
  const save = useMutation({
    mutationFn: (v: any) => gwApi.post("/api/v1/gateway/vendors", v),
    onSuccess: () => {
      toast("Đã tạo vendor", "success");
      reset();
      onDone();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });
  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-2">
      <input className="input" placeholder="Vendor name (Google)" {...register("name", { required: true })} />
      <div className="grid grid-cols-2 gap-2">
        <input className="input font-mono text-xs" placeholder="code (google)" {...register("code", { required: true })} />
        <input className="input font-mono text-xs" placeholder="short_name" {...register("short_name")} />
      </div>
      <textarea className="input" rows={3} placeholder="Vendor description" {...register("description")} />
      <button type="submit" disabled={save.isPending} className="btn-primary w-full">
        {save.isPending ? "Đang tạo..." : "Create Vendor"}
      </button>
    </form>
  );
}

function VendorEditorModal({
  vendor, isCreate, onClose,
}: { vendor: Vendor | null; isCreate: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      code: vendor?.code ?? "",
      name: vendor?.name ?? "",
      short_name: vendor?.short_name ?? "",
      domain: vendor?.domain ?? "",
      description: vendor?.description ?? "",
      status: vendor?.status ?? "active",
    },
  });
  const save = useMutation({
    mutationFn: (v: any) =>
      isCreate
        ? gwApi.post("/api/v1/gateway/vendors", v)
        : gwApi.patch(`/api/v1/gateway/vendors/${vendor!.id}`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-vendors"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">{isCreate ? "Tạo vendor" : `Sửa: ${vendor?.name}`}</h2>
        <div>
          <label className="text-sm font-medium">Name</label>
          <input className="input" {...register("name", { required: true })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-medium">Code</label>
            <input className="input font-mono" {...register("code", { required: true })} disabled={!isCreate} />
          </div>
          <div>
            <label className="text-sm font-medium">Short name</label>
            <input className="input font-mono" {...register("short_name")} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Domain</label>
          <input className="input" {...register("domain")} />
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
