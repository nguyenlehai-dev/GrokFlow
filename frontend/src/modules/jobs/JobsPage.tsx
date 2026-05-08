import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { api } from "@/core/api/axios";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { JobDetailDrawer } from "./JobDetailDrawer";
import { CreateJobModal } from "./CreateJobModal";
import { ResultGalleryModal } from "./ResultGalleryModal";

interface Job {
  id: string;
  provider: string;
  job_type: string;
  prompt: string;
  status: string;
  result_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_FILTERS = [
  { v: "",            label: "Tất cả" },
  { v: "queued",      label: "Queued" },
  { v: "running",     label: "Running" },
  { v: "processing_provider", label: "Processing" },
  { v: "success",     label: "Success" },
  { v: "failed",      label: "Failed" },
  { v: "cancelled",   label: "Cancelled" },
];

export function JobsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data, isLoading } = useQuery({
    queryKey: ["jobs", statusFilter],
    queryFn: async () => {
      const url = statusFilter
        ? `/api/jobs?limit=100&status=${statusFilter}`
        : "/api/jobs?limit=100";
      return (await api.get<Job[]>(url)).data;
    },
    refetchInterval: 5000,
  });
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Job | null>(null);

  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/api/jobs/${id}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/api/jobs/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  // Bulk: cancel every job that's still pre-terminal.
  const cancelAll = useMutation({
    mutationFn: async () => {
      const cancellable = (data ?? []).filter((j) =>
        ["pending", "queued", "running", "processing_provider"].includes(j.status),
      );
      await Promise.allSettled(cancellable.map((j) => api.post(`/api/jobs/${j.id}/cancel`)));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const inFlightCount = (data ?? []).filter((j) =>
    ["pending", "queued", "running", "processing_provider"].includes(j.status),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <div className="flex items-center gap-2">
          <select
            className="input w-auto py-1.5"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.v} value={s.v}>{s.label}</option>
            ))}
          </select>
          {inFlightCount > 0 && (
            <button
              onClick={() => {
                if (confirm(`Cancel ${inFlightCount} job đang chạy / chờ?`)) cancelAll.mutate();
              }}
              className="btn-ghost text-rose-600"
              disabled={cancelAll.isPending}
            >
              {cancelAll.isPending ? "Đang cancel..." : `Cancel all (${inFlightCount})`}
            </button>
          )}
          <button onClick={() => setOpen(true)} className="btn-primary">+ Tạo job</button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Prompt</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((j) => (
                <tr key={j.id} className="border-t cursor-pointer hover:bg-slate-50" onClick={() => setSelected(j.id)}>
                  <td className="px-4 py-2 font-mono text-xs">{j.id.slice(0, 8)}</td>
                  <td className="px-4 py-2">{j.provider}</td>
                  <td className="px-4 py-2">{j.job_type}</td>
                  <td className="px-4 py-2 max-w-xs truncate" title={j.prompt}>{j.prompt}</td>
                  <td className="px-4 py-2"><StatusBadge status={j.status} /></td>
                  <td className="px-4 py-2 text-slate-500">{new Date(j.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 space-x-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {j.status === "success" && (
                      <button
                        className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                        onClick={() => setViewing(j)}
                      >
                        <Eye size={14} /> View
                      </button>
                    )}
                    {["failed", "cancelled"].includes(j.status) && (
                      <button className="btn-ghost" onClick={() => retry.mutate(j.id)}>Retry</button>
                    )}
                    {["pending", "queued", "running", "processing_provider"].includes(j.status) && (
                      <button className="btn-ghost text-rose-600" onClick={() => cancel.mutate(j.id)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Chưa có job nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {open && <CreateJobModal onClose={() => setOpen(false)} />}
      {selected && <JobDetailDrawer jobId={selected} onClose={() => setSelected(null)} />}
      {viewing && (
        <ResultGalleryModal
          jobId={viewing.id}
          jobType={viewing.job_type}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
