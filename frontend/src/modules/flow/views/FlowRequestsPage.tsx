import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Activity, RefreshCw, Download, AlertCircle, CheckCircle2, Loader2,
  PlayCircle, Search, ChevronLeft, ChevronRight, X,
} from "lucide-react";

import { flowApi } from "../services/flow.service";
import { TOOLS, TOOL_BY_SLUG } from "../configs/tools";
import { toast } from "@/components/ui/Toast";

interface FlowJob {
  id: string;
  operation: string;
  status: string;          // uploading | pending | processing | completed | failed
  progress: number;
  params: Record<string, unknown> | null;
  input_files: { filename: string; object_key: string }[] | null;
  output_url: string | null;
  output_filename: string | null;
  file_size: number | null;
  duration: number | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface FlowJobListOut {
  jobs: FlowJob[];
  total: number;
}

const STATUS_VISUAL: Record<string, { color: string; bg: string; icon: typeof CheckCircle2 }> = {
  completed:  { color: "text-emerald-700", bg: "bg-emerald-50", icon: CheckCircle2 },
  failed:     { color: "text-rose-700",    bg: "bg-rose-50",    icon: AlertCircle },
  processing: { color: "text-violet-700",  bg: "bg-violet-50",  icon: Loader2 },
  pending:    { color: "text-amber-700",   bg: "bg-amber-50",   icon: Loader2 },
  uploading:  { color: "text-slate-700",   bg: "bg-white",   icon: Loader2 },
};

const PAGE_SIZE = 20;

/** Flow Requests — single pane to monitor every job's lifecycle, errors,
 *  and output. Mirrors Gateway's /gateway/requests page so operators have
 *  one mental model across modules. Auto-refresh runs every 5s while any
 *  visible row is in a non-terminal state. */
export function FlowRequestsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [toolFilter, setToolFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["flow-jobs", offset],
    queryFn: async () =>
      (await flowApi.get<FlowJobListOut>(`/api/flow/jobs?skip=${offset}&limit=${PAGE_SIZE}`)).data,
    // Refetch while non-terminal jobs are on screen. Faster than waiting
    // for the inline JobCard's 2s poll because the user might be sitting
    // on this page checking status across many jobs at once.
    refetchInterval: (q) => {
      const rows = (q.state.data as FlowJobListOut | undefined)?.jobs ?? [];
      const hasInflight = rows.some((j) => j.status !== "completed" && j.status !== "failed");
      return hasInflight ? 5_000 : 30_000;
    },
  });

  const retry = useMutation({
    mutationFn: (id: string) => flowApi.post(`/api/flow/jobs/${id}/retry`),
    onSuccess: () => {
      toast(t("flow.requests_retry_success"), "info");
      qc.invalidateQueries({ queryKey: ["flow-jobs"] });
    },
    onError: () => toast(t("flow.requests_retry_failed"), "error"),
  });

  // Delete is irreversible — confirm via window.confirm rather than
  // sliding in a modal. Failed-job rows pile up after each upstream bug
  // (the dummy.txt ffmpeg dumps from before the upload validator
  // shipped, for one); without a delete path the list grows forever
  // and operators ignore the page entirely.
  const remove = useMutation({
    mutationFn: (id: string) => flowApi.delete(`/api/flow/jobs/${id}`),
    onSuccess: () => {
      toast("Đã xóa job", "success");
      qc.invalidateQueries({ queryKey: ["flow-jobs"] });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail ?? "Xóa job lỗi";
      toast(typeof msg === "string" ? msg : "Xóa job lỗi", "error");
    },
  });

  // Filter client-side (BE list is already paginated). For a small page
  // this is faster + no extra params to plumb through; if we ever paginate
  // server-side with these filters, move them up to query params.
  const filtered = useMemo(() => {
    const rows = data?.jobs ?? [];
    return rows.filter((j) => {
      if (statusFilter && j.status !== statusFilter) return false;
      if (toolFilter && j.operation !== toolFilter) return false;
      if (search) {
        const needle = search.toLowerCase();
        const hay = (
          j.id +
          j.operation +
          (j.error_message ?? "") +
          (j.output_filename ?? "") +
          JSON.stringify(j.params ?? {}) +
          (j.input_files ?? []).map((f) => f.filename).join(" ")
        ).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, statusFilter, toolFilter, search]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const clearFilters = () => {
    setStatusFilter("");
    setToolFilter("");
    setSearch("");
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Activity size={22} className="text-violet-600" /> {t("flow.requests_title")}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("flow.requests_subtitle")}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-ghost text-xs inline-flex items-center gap-1"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> {t("flow.requests_refresh")}
        </button>
      </header>

      {/* Filter bar */}
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <label className="flex-1 min-w-[180px]">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("flow.requests_search")}
          </span>
          <div className="mt-1 flex items-center rounded-md border border-slate-200 px-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              className="w-full bg-transparent px-2 py-1.5 text-sm outline-none"
              placeholder={t("flow.requests_search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </label>
        <label className="block min-w-[150px]">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("flow.requests_tool")}</span>
          <select
            className="input mt-1 w-full text-sm"
            value={toolFilter}
            onChange={(e) => setToolFilter(e.target.value)}
          >
            <option value="">{t("flow.requests_filter_all")}</option>
            {TOOLS.map((tool) => (
              <option key={tool.slug} value={tool.slug}>{tool.shortLabel}</option>
            ))}
          </select>
        </label>
        <label className="block min-w-[150px]">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("flow.requests_status")}</span>
          <select
            className="input mt-1 w-full text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">{t("flow.requests_filter_all")}</option>
            <option value="completed">✓ {t("flow.requests_status_completed")}</option>
            <option value="failed">✗ {t("flow.requests_status_failed")}</option>
            <option value="processing">⟳ {t("flow.requests_status_processing")}</option>
            <option value="pending">⋯ {t("flow.requests_status_pending")}</option>
            <option value="uploading">⋯ {t("flow.requests_status_uploading")}</option>
          </select>
        </label>
        {(statusFilter || toolFilter || search) && (
          <button
            type="button"
            onClick={clearFilters}
            className="btn-ghost text-xs inline-flex items-center gap-1"
          >
            <X size={12} /> {t("flow.requests_clear_filters")}
          </button>
        )}
      </div>

      {/* Job rows */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card text-center text-sm text-slate-500 py-12">
            {data?.jobs.length === 0
              ? t("flow.requests_empty_no_jobs")
              : t("flow.requests_empty_no_match")}
          </div>
        ) : (
          filtered.map((j) => (
            <JobRow
              key={j.id}
              job={j}
              onRetry={() => retry.mutate(j.id)}
              onDelete={() => {
                if (window.confirm(`Xóa job ${j.id.slice(0, 8)} (${j.operation})? Không thể hoàn tác.`)) {
                  remove.mutate(j.id);
                }
              }}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-600 pt-2">
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost inline-flex items-center gap-0.5 px-2"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" /> {t("flow.requests_prev")}
            </button>
            <span className="px-3 text-sm font-medium">
              {t("flow.requests_page_indicator", { current: currentPage, total: totalPages })}
            </span>
            <button
              type="button"
              className="btn-ghost inline-flex items-center gap-0.5 px-2"
              onClick={() => setOffset(Math.min((totalPages - 1) * PAGE_SIZE, offset + PAGE_SIZE))}
              disabled={currentPage >= totalPages}
            >
              {t("flow.requests_next")} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function JobRow({ job, onRetry, onDelete }: { job: FlowJob; onRetry: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const visual = STATUS_VISUAL[job.status] ?? STATUS_VISUAL.pending;
  const Icon = visual.icon;
  const isInflight = job.status === "processing" || job.status === "pending" || job.status === "uploading";
  const tool = TOOL_BY_SLUG[job.operation];

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${visual.bg}`}>
            <Icon
              className={`h-5 w-5 ${visual.color} ${isInflight ? "animate-spin" : ""}`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800">
                {tool?.shortLabel ?? job.operation}
              </span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${visual.bg} ${visual.color}`}
              >
                {job.status}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-slate-500 font-mono">
              {job.id.slice(0, 8)} · {new Date(job.created_at).toLocaleString("vi-VN")}
              {job.duration !== null && job.duration > 0 && (
                <> · {job.duration.toFixed(1)}s</>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(job.status === "failed" || job.status === "completed") && job.input_files && job.input_files.length > 0 && (
            <button
              type="button"
              onClick={onRetry}
              className="btn-ghost text-xs inline-flex items-center gap-1"
              title={t("flow.requests_retry_title")}
            >
              <PlayCircle size={14} /> {t("flow.requests_retry")}
            </button>
          )}
          {/* Delete — only for terminal-state rows. Active jobs would need
              a cancel flow first; the backend refuses to delete them. */}
          {(job.status === "failed" || job.status === "completed") && (
            <button
              type="button"
              onClick={onDelete}
              className="btn-ghost text-xs inline-flex items-center gap-1 text-rose-600 hover:bg-rose-50"
              title="Xóa job (không thể hoàn tác)"
            >
              <X size={14} /> Xóa
            </button>
          )}
          {job.status === "completed" && job.output_url && (
            <a
              href={job.output_url}
              download={job.output_filename ?? undefined}
              className="btn-primary text-xs inline-flex items-center gap-1"
            >
              <Download size={14} />
              {job.file_size ? `${(job.file_size / 1024 / 1024).toFixed(1)} MB` : t("flow.requests_download")}
            </a>
          )}
        </div>
      </div>

      {/* Inflight progress */}
      {isInflight && job.progress > 0 && job.progress < 100 && (
        <div>
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>{t("flow.requests_progress")}</span>
            <span>{Math.round(job.progress)}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-100">
            <div
              className="h-full bg-violet-500 transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Input / params summary */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
        {job.input_files && job.input_files.length > 0 && (
          <div>
            <span className="text-slate-500 font-semibold uppercase tracking-wide">{t("flow.requests_input")}</span>
            <ul className="mt-1 space-y-0.5 text-slate-700 font-mono">
              {job.input_files.map((f) => (
                <li key={f.object_key} className="truncate">{f.filename}</li>
              ))}
            </ul>
          </div>
        )}
        {job.params && Object.keys(job.params).length > 0 && (
          <div>
            <span className="text-slate-500 font-semibold uppercase tracking-wide">{t("flow.requests_params")}</span>
            <div className="mt-1 font-mono text-slate-700">
              {Object.entries(job.params)
                .filter(([k]) => k !== "_owner")
                .map(([k, v]) => (
                  <span key={k} className="mr-3 inline-block">
                    <span className="text-slate-400">{k}=</span>{String(v)}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Output preview (completed) — inline video for mp4, link for others */}
      {job.status === "completed" && job.output_url && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
            {t("flow.requests_view_output")}
          </summary>
          <div className="mt-2">
            {job.output_url.match(/\.(mp4|mov|webm)$/i) ? (
              <video
                src={job.output_url}
                controls
                className="w-full max-w-md rounded border border-slate-200"
              />
            ) : job.output_url.match(/\.(png|jpe?g|gif|webp)$/i) ? (
              <img
                src={job.output_url}
                alt="output"
                className="max-w-md rounded border border-slate-200"
              />
            ) : (
              <a
                href={job.output_url}
                download
                className="text-violet-600 hover:underline"
              >
                {job.output_filename ?? job.output_url}
              </a>
            )}
          </div>
        </details>
      )}

      {/* Error trace (failed) */}
      {job.status === "failed" && job.error_message && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <span className="font-semibold uppercase tracking-wide">{t("flow.requests_error_label")}:</span>{" "}
          <span className="font-mono">{job.error_message}</span>
        </div>
      )}
    </div>
  );
}
