import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api } from "@/core/api/axios";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  status: string;
  allowed_providers: string[];
  allowed_job_types: string[];
  daily_limit: number;
  used_today: number;
  last_used_at: string | null;
  created_at: string;
}

interface CreateValues {
  name: string;
  providers: { grok: boolean; flow: boolean };
  jobTypes: { image: boolean; video: boolean };
  daily_limit: number;
}

export function ApiKeysPage() {
  const qc = useQueryClient();
  const { data: keys, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => (await api.get<ApiKey[]>("/api/api-keys")).data,
  });
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ name: string; api_key: string } | null>(null);

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.patch(`/api/api-keys/${id}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <button onClick={() => setOpen(true)} className="btn-primary">+ Tạo API Key</button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Prefix</th>
                <th className="px-4 py-2">Providers</th>
                <th className="px-4 py-2">Job types</th>
                <th className="px-4 py-2">Daily</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys?.map((k) => (
                <tr key={k.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{k.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{k.key_prefix}…</td>
                  <td className="px-4 py-2">{k.allowed_providers.join(", ") || "—"}</td>
                  <td className="px-4 py-2">{k.allowed_job_types.join(", ") || "—"}</td>
                  <td className="px-4 py-2">{k.used_today}/{k.daily_limit}</td>
                  <td className="px-4 py-2"><StatusBadge status={k.status} /></td>
                  <td className="px-4 py-2">
                    {k.status === "active" && (
                      <button onClick={() => revokeMut.mutate(k.id)} className="btn-ghost text-rose-600">
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {keys?.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Chưa có API key nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {open && <CreateModal onClose={() => setOpen(false)} onCreated={(c) => { setCreated(c); setOpen(false); }} />}
      {created && <CreatedModal value={created} onClose={() => setCreated(null)} />}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (v: { name: string; api_key: string }) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<CreateValues>({
    defaultValues: { providers: { grok: true, flow: false }, jobTypes: { image: true, video: false }, daily_limit: 1000 },
  });

  const onSubmit = async (v: CreateValues) => {
    const allowed_providers = Object.entries(v.providers).filter(([, on]) => on).map(([k]) => k);
    const allowed_job_types = Object.entries(v.jobTypes).filter(([, on]) => on).map(([k]) => k);
    const { data } = await api.post("/api/api-keys", {
      name: v.name,
      allowed_providers,
      allowed_job_types,
      daily_limit: Number(v.daily_limit),
    });
    qc.invalidateQueries({ queryKey: ["api-keys"] });
    onCreated({ name: data.name, api_key: data.api_key });
  };

  return (
    <Modal title="Tạo API Key" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="text-sm font-medium">Name</label>
          <input className="input" {...register("name", { required: true })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Providers</legend>
            <label className="flex gap-2 text-sm"><input type="checkbox" {...register("providers.grok")} /> grok</label>
            <label className="flex gap-2 text-sm"><input type="checkbox" {...register("providers.flow")} /> flow</label>
          </fieldset>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Job types</legend>
            <label className="flex gap-2 text-sm"><input type="checkbox" {...register("jobTypes.image")} /> image</label>
            <label className="flex gap-2 text-sm"><input type="checkbox" {...register("jobTypes.video")} /> video</label>
          </fieldset>
        </div>
        <div>
          <label className="text-sm font-medium">Daily limit</label>
          <input className="input" type="number" {...register("daily_limit", { required: true, min: 1 })} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>Tạo key</button>
        </div>
      </form>
    </Modal>
  );
}

function CreatedModal({ value, onClose }: { value: { name: string; api_key: string }; onClose: () => void }) {
  return (
    <Modal title="Copy ngay – key chỉ hiển thị 1 lần" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Key cho <strong>{value.name}</strong>:</p>
        <pre className="rounded-md bg-slate-900 p-3 text-xs text-slate-100 whitespace-pre-wrap break-all">{value.api_key}</pre>
        <button className="btn-primary" onClick={() => navigator.clipboard.writeText(value.api_key)}>Copy</button>
        <button className="btn-ghost ml-2" onClick={onClose}>Tôi đã lưu</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
