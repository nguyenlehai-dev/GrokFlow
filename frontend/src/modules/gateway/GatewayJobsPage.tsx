import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Activity, Plus, RefreshCw, RotateCw } from "lucide-react";
import { gatewayApi } from "@/core/api/gateway";
import { toast } from "@/components/ui/Toast";
import { GatewayAuthGuard } from "./GatewayAuthGuard";
import { ErrorPanel, extractError } from "./GatewayProfilesPage";

interface Job {
  id: string;
  profile_id: string;
  target: string;
  prompt: string;
  negative_prompt: string | null;
  count: number;
  status: string;
  provider_payload: any;
  result_payload: any;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface Profile {
  id: string;
  name: string;
  category: string;
}

export function GatewayJobsPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: jobs, isLoading, error, refetch } = useQuery({
    queryKey: ["gw-jobs"],
    queryFn: async () => (await gatewayApi.get<Job[]>("/api/jobs")).data,
    retry: false,
    refetchInterval: 5000,
  });

  const retry = useMutation({
    mutationFn: (id: string) => gatewayApi.post(`/api/jobs/${id}/retry`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-jobs"] });
      toast("Đã queue retry", "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Activity size={22} /> Gateway — Jobs
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-ghost text-xs">
            <RefreshCw size={12} className="inline mr-1" /> Refresh
          </button>
          <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
            <Plus size={14} /> Tạo job
          </button>
        </div>
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
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Profile</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Prompt</th>
                <th className="px-3 py-2">Count</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((j) => (
                <tr key={j.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{j.id.slice(0, 8)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{j.profile_id.slice(0, 8)}</td>
                  <td className="px-3 py-2">{j.target}</td>
                  <td className="px-3 py-2 max-w-xs">
                    <div className="truncate" title={j.prompt}>{j.prompt}</div>
                    {j.error_message && (
                      <div className="text-xs text-rose-600 truncate" title={j.error_message}>
                        ⚠ {j.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{j.count}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={j.status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(j.created_at).toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {(j.status === "failed" || j.status === "succeeded") && (
                      <button
                        onClick={() => retry.mutate(j.id)}
                        className="btn-ghost text-xs"
                        title="Re-queue job"
                      >
                        <RotateCw size={12} className="inline mr-1" /> Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {(jobs ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Chưa có job nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {creating && <CreateJobModal onClose={() => setCreating(false)} onCreated={() => {
        qc.invalidateQueries({ queryKey: ["gw-jobs"] });
        setCreating(false);
      }} />}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "completed" || status === "success" ? "bg-emerald-100 text-emerald-700"
    : status === "running" || status === "processing" ? "bg-blue-100 text-blue-700"
    : status === "failed" || status === "error" ? "bg-rose-100 text-rose-700"
    : status === "queued" || status === "pending" ? "bg-amber-100 text-amber-700"
    : "bg-slate-100 text-slate-600";
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{status}</span>;
}

function CreateJobModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: () => void }) {
  const { data: profiles } = useQuery({
    queryKey: ["gw-profiles"],
    queryFn: async () => (await gatewayApi.get<Profile[]>("/api/profiles")).data,
    retry: false,
  });
  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      profile_id: "",
      target: "image",
      prompt: "",
      negative_prompt: "",
      count: 1,
    },
  });
  const profileId = watch("profile_id");
  const selectedProfile = profiles?.find((p) => p.id === profileId);

  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        profile_id: v.profile_id,
        target: v.target,
        prompt: v.prompt,
        negative_prompt: v.negative_prompt || null,
        count: Number(v.count),
      };
      return gatewayApi.post("/api/jobs", payload);
    },
    onSuccess: () => {
      toast("Đã tạo job", "success");
      onCreated();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3"
      >
        <h2 className="text-lg font-semibold">Tạo job gateway</h2>

        <div>
          <label className="text-sm font-medium">Profile</label>
          <select className="input" {...register("profile_id", { required: true })}>
            <option value="">— chọn —</option>
            {(profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Target</label>
            <select className="input" {...register("target")}>
              <option value="image">image</option>
              <option value="video">video</option>
            </select>
            {selectedProfile && (
              <p className="text-xs text-slate-500 mt-1">
                Profile category: <code>{selectedProfile.category}</code>
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">Count</label>
            <input className="input" type="number" min={1} max={10}
              {...register("count", { valueAsNumber: true })} />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Prompt</label>
          <textarea className="input" rows={3} {...register("prompt", { required: true })} />
        </div>

        <div>
          <label className="text-sm font-medium">Negative prompt (tùy chọn)</label>
          <input className="input" {...register("negative_prompt")} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? "Đang tạo..." : "Tạo job"}
          </button>
        </div>
      </form>
    </div>
  );
}
