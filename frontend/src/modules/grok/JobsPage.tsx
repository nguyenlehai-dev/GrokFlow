import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Images, Pencil, Trash2, RefreshCw, Ban, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus } from "lucide-react";
import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { JobDetailDrawer } from "./JobDetailDrawer";
import { CreateJobModal } from "./CreateJobModal";
import { ResultGalleryModal } from "./ResultGalleryModal";
import { EditJobModal } from "./EditJobModal";

interface Job {
  id: string;
  provider: string;
  job_type: string;
  prompt: string;
  status: string;
  result_url: string | null;
  error_message: string | null;
  retry_count: number;
  max_retry?: number;
  next_attempt_at?: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_FILTERS = [
  { v: "",                     label: "Tất cả status" },
  { v: "queued",               label: "Queued" },
  { v: "running",              label: "Running" },
  { v: "processing_provider",  label: "Processing" },
  { v: "success",              label: "Success" },
  { v: "failed",               label: "Failed" },
  { v: "cancelled",            label: "Cancelled" },
];
const PROVIDER_FILTERS = [
  { v: "", label: "Mọi provider" },
  { v: "grok", label: "Grok" },
  { v: "flow", label: "Flow" },
];
const TYPE_FILTERS = [
  { v: "", label: "Image + Video" },
  { v: "image", label: "Image" },
  { v: "video", label: "Video" },
];
const PAGE_SIZES = [10, 20, 50, 100];

const ERROR_HINTS: Record<string, string> = {
  rate_limited: "Tài khoản Grok bị giới hạn — đợi cooldown hoặc dùng profile khác.",
  cookie_expired: "Phiên Grok hết hạn — admin Auto-login lại.",
  captcha_required: "Grok yêu cầu captcha — admin mở VNC giải.",
  provider_blocked: "Account thiếu quyền (cần Pro/Premium/Heavy).",
  browser_crashed: "Chromium crash — sẽ retry.",
  network_error: "Lỗi mạng — sẽ retry.",
  timeout: "Grok không trả kết quả — sẽ retry.",
  retries_exhausted: "Hết số lần retry. Bấm Retry để thử lại.",
};

function parseError(msg: string | null): { code: string; rest: string } | null {
  if (!msg) return null;
  const m = msg.match(/^\[([a-z_]+)\]\s*(.*)$/);
  if (!m) return null;
  return { code: m[1], rest: m[2] };
}

export function JobsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const offset = (page - 1) * pageSize;
  const queryKey = ["jobs", statusFilter, providerFilter, typeFilter, search, page, pageSize];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String(offset));
      if (statusFilter) params.set("status", statusFilter);
      if (providerFilter) params.set("provider", providerFilter);
      if (typeFilter) params.set("job_type", typeFilter);
      if (search) params.set("q", search);
      const r = await api.get<Job[]>(`/api/jobs?${params}`);
      const total = parseInt(r.headers["x-total-count"] || "0", 10);
      return { items: r.data, total };
    },
    refetchInterval: 5000,
  });

  // Toast on terminal state changes — track previous statuses by job id.
  const prevStatusesRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const prev = prevStatusesRef.current;
    const curr: Record<string, string> = {};
    for (const j of data?.items ?? []) {
      curr[j.id] = j.status;
      const before = prev[j.id];
      if (before && before !== j.status) {
        if (j.status === "success") {
          toast(`✅ Job ${j.id.slice(0, 8)} thành công — ${j.job_type}`, "success");
        } else if (j.status === "failed") {
          const parsed = parseError(j.error_message);
          const hint = parsed && ERROR_HINTS[parsed.code];
          const detail = parsed
            ? `[${parsed.code}] ${hint ?? parsed.rest.slice(0, 80)}`
            : (j.error_message?.slice(0, 90) ?? "lỗi không xác định");
          toast(`❌ Job ${j.id.slice(0, 8)} fail: ${detail}`, "error");
        } else if (j.status === "cancelled" && before !== "cancelled") {
          toast(`Job ${j.id.slice(0, 8)} đã hủy.`, "info");
        }
      }
    }
    prevStatusesRef.current = curr;
  }, [data?.items]);

  const [createOpen, setCreateOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [galleryJob, setGalleryJob] = useState<Job | null>(null);
  const [editJob, setEditJob] = useState<Job | null>(null);

  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/api/jobs/${id}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/api/jobs/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/jobs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast("Đã xóa job.", "success");
    },
  });
  const cancelAll = useMutation({
    mutationFn: async () => {
      const cancellable = (data?.items ?? []).filter((j) =>
        ["pending", "queued", "running", "processing_provider"].includes(j.status),
      );
      await Promise.allSettled(cancellable.map((j) => api.post(`/api/jobs/${j.id}/cancel`)));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const inFlightCount = items.filter((j) =>
    ["pending", "queued", "running", "processing_provider"].includes(j.status),
  ).length;

  // When filters change, reset to page 1.
  useEffect(() => { setPage(1); }, [statusFilter, providerFilter, typeFilter, search, pageSize]);

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-subtitle">
            Theo dõi tất cả job AI đang chạy. Refresh tự động mỗi 5 giây.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {inFlightCount > 0 && (
            <button
              onClick={() => {
                if (confirm(`Cancel ${inFlightCount} job đang chạy / chờ?`)) cancelAll.mutate();
              }}
              className="btn-secondary text-amber-700 border-amber-200 hover:border-amber-300"
              disabled={cancelAll.isPending}
            >
              <Ban size={15} />
              {cancelAll.isPending ? "Đang cancel..." : `Cancel all (${inFlightCount})`}
            </button>
          )}
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            <Plus size={16} />
            Tạo job
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card flex flex-wrap items-center gap-2.5 py-3.5">
        <input
          type="text"
          placeholder="🔍  Tìm prompt..."
          className="input w-56 input-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input input-sm w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_FILTERS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        <select className="input input-sm w-auto" value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
          {PROVIDER_FILTERS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        <select className="input input-sm w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          {TYPE_FILTERS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        {(search || statusFilter || providerFilter || typeFilter) && (
          <button
            className="btn-ghost btn-sm"
            onClick={() => { setSearch(""); setStatusFilter(""); setProviderFilter(""); setTypeFilter(""); }}
          >
            Clear filter
          </button>
        )}
        <div className="ml-auto text-xs text-ink-500 font-medium">
          <span className="text-ink-900 font-bold">{total}</span> jobs total
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Prompt</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => {
                const parsed = parseError(j.error_message);
                const editable = ["pending", "queued"].includes(j.status);
                const cancellable = ["pending", "queued", "running", "processing_provider"].includes(j.status);
                const retryable = ["failed", "cancelled"].includes(j.status);
                const deletable = !["running", "processing_provider", "uploading_result"].includes(j.status);
                return (
                  <tr key={j.id} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs">{j.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">{j.provider}</td>
                    <td className="px-3 py-2">{j.job_type}</td>
                    <td className="px-3 py-2 max-w-xs">
                      <div className="truncate" title={j.prompt}>{j.prompt}</div>
                      {parsed && j.status === "failed" && (
                        <div className="text-xs text-rose-600 mt-0.5 truncate" title={j.error_message ?? ""}>
                          ⚠ [{parsed.code}] {ERROR_HINTS[parsed.code] ?? parsed.rest}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={j.status} /></td>
                    <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(j.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {/* View — opens detail drawer with logs + result */}
                        <button
                          className="p-1.5 rounded hover:bg-slate-200 text-slate-600"
                          title="Xem chi tiết"
                          onClick={() => setDrawerId(j.id)}
                        >
                          <Eye size={16} />
                        </button>
                        {/* Result gallery (only when success) */}
                        {j.status === "success" && (
                          <button
                            className="p-1.5 rounded hover:bg-emerald-100 text-emerald-600"
                            title="Xem kết quả"
                            onClick={() => setGalleryJob(j)}
                          >
                            <Images size={16} />
                          </button>
                        )}
                        {/* Edit (queued/pending only) */}
                        <button
                          className={`p-1.5 rounded ${editable ? "hover:bg-amber-100 text-amber-600" : "text-slate-300 cursor-not-allowed"}`}
                          title={editable ? "Sửa prompt" : "Job đã chạy không sửa được"}
                          disabled={!editable}
                          onClick={() => editable && setEditJob(j)}
                        >
                          <Pencil size={16} />
                        </button>
                        {/* Retry (failed/cancelled) */}
                        <button
                          className={`p-1.5 rounded ${retryable ? "hover:bg-blue-100 text-blue-600" : "text-slate-300 cursor-not-allowed"}`}
                          title={retryable ? "Retry" : "Chỉ retry được job failed/cancelled"}
                          disabled={!retryable}
                          onClick={() => retryable && retry.mutate(j.id)}
                        >
                          <RefreshCw size={16} />
                        </button>
                        {/* Cancel (in-flight) */}
                        {cancellable && (
                          <button
                            className="p-1.5 rounded hover:bg-amber-100 text-amber-600"
                            title="Hủy job"
                            onClick={() => {
                              if (confirm("Hủy job này?")) cancel.mutate(j.id);
                            }}
                          >
                            <Ban size={16} />
                          </button>
                        )}
                        {/* Delete (terminal only) */}
                        <button
                          className={`p-1.5 rounded ${deletable ? "hover:bg-rose-100 text-rose-600" : "text-slate-300 cursor-not-allowed"}`}
                          title={deletable ? "Xóa vĩnh viễn" : "Job đang chạy, hủy trước"}
                          disabled={!deletable}
                          onClick={() => {
                            if (deletable && confirm(`Xóa job ${j.id.slice(0, 8)}?`)) remove.mutate(j.id);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Không có job phù hợp filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t px-3 py-2 bg-slate-50 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Mỗi trang:</span>
              <select
                className="input w-auto py-1 text-xs"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="text-slate-500 text-xs">
              {total === 0 ? "0" : `${offset + 1}–${Math.min(offset + items.length, total)}`} / {total}
            </div>
            <div className="flex items-center gap-1">
              <button
                className="btn-ghost px-2 py-1 disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage(1)}
                title="Trang đầu"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                className="btn-ghost px-2 py-1 disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                title="Trang trước"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-2 text-xs">
                {page} / {totalPages}
              </span>
              <button
                className="btn-ghost px-2 py-1 disabled:opacity-30"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                title="Trang sau"
              >
                <ChevronRight size={14} />
              </button>
              <button
                className="btn-ghost px-2 py-1 disabled:opacity-30"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                title="Trang cuối"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {createOpen && <CreateJobModal onClose={() => setCreateOpen(false)} />}
      {drawerId && <JobDetailDrawer jobId={drawerId} onClose={() => setDrawerId(null)} />}
      {galleryJob && (
        <ResultGalleryModal
          jobId={galleryJob.id}
          jobType={galleryJob.job_type}
          onClose={() => setGalleryJob(null)}
        />
      )}
      {editJob && <EditJobModal job={editJob} onClose={() => setEditJob(null)} />}
    </div>
  );
}
