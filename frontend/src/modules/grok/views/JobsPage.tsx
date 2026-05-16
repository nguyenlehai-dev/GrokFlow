import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Eye, Images, Pencil, Trash2, RefreshCw, Ban, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { JobDetailDrawer } from "../components/JobDetailDrawer";
import { CreateJobModal } from "../components/CreateJobModal";
import { ResultGalleryModal } from "../components/ResultGalleryModal";
import { EditJobModal } from "../components/EditJobModal";
import type { Job } from "../models/job";
import { jobsService } from "../services/jobs.service";
import { ERROR_HINTS, parseErrorCode } from "../utils/jobError";

const PAGE_SIZES = [10, 20, 50, 100];

export function JobsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const STATUS_FILTERS = [
    { v: "",                     label: t("grok.jobs_filter_all_status") },
    { v: "queued",               label: "Queued" },
    { v: "running",              label: "Running" },
    { v: "processing_provider",  label: "Processing" },
    { v: "success",              label: "Success" },
    { v: "failed",               label: "Failed" },
    { v: "cancelled",            label: "Cancelled" },
  ];
  const PROVIDER_FILTERS = [
    { v: "", label: t("grok.jobs_filter_all_provider") },
    { v: "grok", label: "Grok" },
    { v: "flow", label: "Flow" },
  ];
  const TYPE_FILTERS = [
    { v: "", label: t("grok.jobs_filter_all_type") },
    { v: "image", label: t("grok.jobs_filter_image") },
    { v: "video", label: t("grok.jobs_filter_video") },
  ];

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
      const r = await jobsService.listRaw(params.toString());
      const total = parseInt(r.headers["x-total-count"] || "0", 10);
      return { items: r.data, total };
    },
    refetchInterval: 5000,
  });

  const prevStatusesRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const prev = prevStatusesRef.current;
    const curr: Record<string, string> = {};
    for (const j of data?.items ?? []) {
      curr[j.id] = j.status;
      const before = prev[j.id];
      if (before && before !== j.status) {
        const shortId = j.id.slice(0, 8);
        if (j.status === "success") {
          toast(t("grok.jobs_toast_success", { id: shortId, type: j.job_type }), "success");
        } else if (j.status === "failed") {
          const parsed = parseErrorCode(j.error_message);
          const hint = parsed && ERROR_HINTS[parsed.code];
          const detail = parsed
            ? `[${parsed.code}] ${hint ?? parsed.rest.slice(0, 80)}`
            : (j.error_message?.slice(0, 90) ?? t("grok.jobs_toast_error_unknown"));
          toast(t("grok.jobs_toast_failed", { id: shortId, detail }), "error");
        } else if (j.status === "cancelled" && before !== "cancelled") {
          toast(t("grok.jobs_toast_cancelled", { id: shortId }), "info");
        }
      }
    }
    prevStatusesRef.current = curr;
  }, [data?.items, t]);

  const [createOpen, setCreateOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [galleryJob, setGalleryJob] = useState<Job | null>(null);
  const [editJob, setEditJob] = useState<Job | null>(null);

  const retry = useMutation({
    mutationFn: (id: string) => jobsService.retry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => jobsService.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => jobsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      toast(t("grok.jobs_deleted_toast"), "success");
    },
  });
  const cancelAll = useMutation({
    mutationFn: async () => {
      const cancellable = (data?.items ?? []).filter((j) =>
        ["pending", "queued", "running", "processing_provider"].includes(j.status),
      );
      await Promise.allSettled(cancellable.map((j) => jobsService.cancel(j.id)));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const inFlightCount = items.filter((j) =>
    ["pending", "queued", "running", "processing_provider"].includes(j.status),
  ).length;

  useEffect(() => { setPage(1); }, [statusFilter, providerFilter, typeFilter, search, pageSize]);

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("grok.jobs_title")}</h1>
          <p className="page-subtitle">{t("grok.jobs_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {inFlightCount > 0 && (
            <button
              onClick={() => {
                if (confirm(t("grok.jobs_cancel_all_confirm", { count: inFlightCount }))) cancelAll.mutate();
              }}
              className="btn-secondary text-amber-700 border-amber-200 hover:border-amber-300"
              disabled={cancelAll.isPending}
            >
              <Ban size={15} />
              {cancelAll.isPending
                ? t("grok.jobs_cancel_all_loading")
                : t("grok.jobs_cancel_all", { count: inFlightCount })}
            </button>
          )}
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            <Plus size={16} />
            {t("grok.jobs_create")}
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-2.5 py-3.5">
        <input
          type="text"
          placeholder={t("grok.jobs_search_placeholder")}
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
            {t("grok.jobs_clear_filter")}
          </button>
        )}
        <div className="ml-auto text-xs text-slate-400 font-medium">
          <span className="text-slate-900 font-bold">{total}</span> {t("grok.jobs_total_suffix")}
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">{t("grok.jobs_th_id")}</th>
                <th className="px-3 py-2">{t("grok.jobs_th_provider")}</th>
                <th className="px-3 py-2">{t("grok.jobs_th_type")}</th>
                <th className="px-3 py-2">{t("grok.jobs_th_prompt")}</th>
                <th className="px-3 py-2">{t("grok.jobs_th_status")}</th>
                <th className="px-3 py-2">{t("grok.jobs_th_created")}</th>
                <th className="px-3 py-2">{t("grok.jobs_th_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => {
                const parsed = parseErrorCode(j.error_message);
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
                        <button
                          className="p-1.5 rounded hover:bg-slate-200 text-slate-600"
                          title={t("grok.jobs_view")}
                          onClick={() => setDrawerId(j.id)}
                        >
                          <Eye size={16} />
                        </button>
                        {j.status === "success" && (
                          <button
                            className="p-1.5 rounded hover:bg-emerald-100 text-emerald-600"
                            title={t("grok.jobs_view_result")}
                            onClick={() => setGalleryJob(j)}
                          >
                            <Images size={16} />
                          </button>
                        )}
                        <button
                          className={`p-1.5 rounded ${editable ? "hover:bg-amber-100 text-amber-600" : "text-slate-400 cursor-not-allowed"}`}
                          title={editable ? t("grok.jobs_edit_prompt") : t("grok.jobs_edit_locked")}
                          disabled={!editable}
                          onClick={() => editable && setEditJob(j)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className={`p-1.5 rounded ${retryable ? "hover:bg-blue-100 text-blue-600" : "text-slate-400 cursor-not-allowed"}`}
                          title={retryable ? t("grok.jobs_retry_title") : t("grok.jobs_retry_locked")}
                          disabled={!retryable}
                          onClick={() => retryable && retry.mutate(j.id)}
                        >
                          <RefreshCw size={16} />
                        </button>
                        {cancellable && (
                          <button
                            className="p-1.5 rounded hover:bg-amber-100 text-amber-600"
                            title={t("grok.jobs_cancel_title")}
                            onClick={() => {
                              if (confirm(t("grok.jobs_cancel_confirm"))) cancel.mutate(j.id);
                            }}
                          >
                            <Ban size={16} />
                          </button>
                        )}
                        <button
                          className={`p-1.5 rounded ${deletable ? "hover:bg-rose-100 text-rose-600" : "text-slate-400 cursor-not-allowed"}`}
                          title={deletable ? t("grok.jobs_delete_title") : t("grok.jobs_delete_locked")}
                          disabled={!deletable}
                          onClick={() => {
                            if (deletable && confirm(t("grok.jobs_delete_confirm", { id: j.id.slice(0, 8) }))) remove.mutate(j.id);
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
                    {t("grok.jobs_empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between border-t px-3 py-2 bg-slate-50 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">{t("grok.jobs_per_page")}</span>
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
                title={t("grok.jobs_pg_first")}
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                className="btn-ghost px-2 py-1 disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                title={t("grok.jobs_pg_prev")}
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
                title={t("grok.jobs_pg_next")}
              >
                <ChevronRight size={14} />
              </button>
              <button
                className="btn-ghost px-2 py-1 disabled:opacity-30"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                title={t("grok.jobs_pg_last")}
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
