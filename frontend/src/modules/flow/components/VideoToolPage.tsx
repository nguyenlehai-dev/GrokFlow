import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Download, RefreshCw, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ToolDef } from "../tools";
import {
  uploadInputs,
  runTool,
  getJob,
  retryJob,
  type FlowJob,
} from "../api";

interface Props {
  tool: ToolDef;
}

/** Job IDs the current browser session owns. Persisted to localStorage so a
 *  reload doesn't lose ongoing jobs. Keyed by tool slug for the per-tool
 *  history strip — listing is opt-in, not authoritative. */
const STORAGE_KEY = "flow.myJobs";

function loadMyJobs(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function rememberJob(toolSlug: string, jobId: string) {
  const all = loadMyJobs();
  all[toolSlug] = [jobId, ...(all[toolSlug] ?? []).filter((id) => id !== jobId)].slice(0, 20);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function VideoToolPage({ tool }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string | number | boolean>>(() => {
    const init: Record<string, string | number | boolean> = {};
    for (const f of tool.fields) if (f.default !== undefined) init[f.name] = f.default;
    return init;
  });
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<FlowJob | null>(null);
  const pollRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isTerminal = job?.status === "completed" || job?.status === "failed";

  // Reset state when the tool slug changes — the route reuses this component.
  useEffect(() => {
    setFiles([]);
    setUploadPct(0);
    setJob(null);
    setFieldValues(() => {
      const init: Record<string, string | number | boolean> = {};
      for (const f of tool.fields) if (f.default !== undefined) init[f.name] = f.default;
      return init;
    });
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [tool.slug]);

  // Poll every 2s while a job is non-terminal. 2s strikes a balance: feels
  // responsive while not hammering the backend for sub-30s jobs.
  useEffect(() => {
    if (!job || isTerminal) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(async () => {
      try {
        const next = await getJob(job.id);
        setJob(next);
      } catch {
        /* network blip — keep polling */
      }
    }, 2000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [job?.id, job?.status, isTerminal]);

  const onPickFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = Array.from(incoming).slice(0, tool.inputFiles.max);
    setFiles(next);
  };

  const submit = useCallback(async () => {
    if (files.length < tool.inputFiles.min) {
      toast(`Cần ít nhất ${tool.inputFiles.min} file`, "error");
      return;
    }
    setSubmitting(true);
    setUploadPct(0);
    setJob(null);
    try {
      const init = await uploadInputs(tool.slug, files, setUploadPct);
      rememberJob(tool.slug, init.job_id);
      const started = await runTool(tool.slug, init.job_id, fieldValues);
      setJob(started);
      toast("Đã gửi job, đang xử lý…", "info");
    } catch (e) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast(msg ?? "Không gửi được job", "error");
    } finally {
      setSubmitting(false);
    }
  }, [files, fieldValues, tool]);

  const handleRetry = async () => {
    if (!job) return;
    try {
      const r = await retryJob(job.id);
      setJob(r);
    } catch {
      toast("Retry failed", "error");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-3 text-2xl font-semibold">
          <tool.icon className="h-6 w-6 text-blue-600" />
          {tool.label}
        </h1>
        <p className="text-sm text-slate-500">{tool.description}</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Chọn file đầu vào</span>
          <div
            className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 transition hover:border-blue-400 hover:bg-blue-50"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPickFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm text-slate-600">
              {files.length === 0
                ? `Kéo thả hoặc click để chọn ${
                    tool.inputFiles.min === tool.inputFiles.max
                      ? `${tool.inputFiles.min} file`
                      : `${tool.inputFiles.min}–${tool.inputFiles.max} file`
                  }`
                : `${files.length} file đã chọn`}
            </p>
            <p className="mt-1 text-xs text-slate-400">{tool.inputFiles.accept}</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={tool.inputFiles.accept}
            multiple={tool.inputFiles.max > 1}
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
        </label>

        {files.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-slate-500">
            {files.map((f, i) => (
              <li key={i} className="flex justify-between">
                <span className="truncate">{f.name}</span>
                <span className="ml-2 shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              </li>
            ))}
          </ul>
        )}

        {tool.fields.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tool.fields.map((f) => (
              <label key={f.name} className="block text-sm">
                <span className="font-medium text-slate-700">{f.label}</span>
                {f.kind === "boolean" ? (
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!fieldValues[f.name]}
                      onChange={(e) =>
                        setFieldValues((v) => ({ ...v, [f.name]: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {f.help && <span className="text-xs text-slate-500">{f.help}</span>}
                  </div>
                ) : (
                  <input
                    type={f.kind === "number" ? "number" : "text"}
                    value={String(fieldValues[f.name] ?? "")}
                    placeholder={f.placeholder}
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setFieldValues((v) => ({
                        ...v,
                        [f.name]: f.kind === "number" ? (raw === "" ? "" : Number(raw)) : raw,
                      }));
                    }}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}
                {f.help && f.kind !== "boolean" && (
                  <span className="mt-1 block text-xs text-slate-500">{f.help}</span>
                )}
              </label>
            ))}
          </div>
        )}

        {submitting && uploadPct > 0 && uploadPct < 100 && (
          <div className="mt-4">
            <p className="text-xs text-slate-500">Đang upload: {uploadPct}%</p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-100">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || files.length < tool.inputFiles.min}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang gửi…
            </>
          ) : (
            <>Bắt đầu xử lý</>
          )}
        </button>
      </section>

      {job && <JobCard job={job} onRetry={handleRetry} />}
    </div>
  );
}

function JobCard({ job, onRetry }: { job: FlowJob; onRetry: () => void }) {
  const done = job.status === "completed";
  const failed = job.status === "failed";
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {done && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            {failed && <AlertCircle className="h-5 w-5 text-rose-500" />}
            {!done && !failed && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
            <h2 className="text-base font-semibold">Job {job.id.slice(0, 8)}</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(job.created_at).toLocaleString("vi-VN")}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </header>

      {!done && !failed && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Tiến độ</span>
            <span>{Math.round(job.progress)}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-100">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      )}

      {failed && job.error_message && (
        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {job.error_message}
        </p>
      )}

      {done && job.output_url && (
        <div className="mt-4 space-y-2">
          {job.output_url.match(/\.(mp4|mov|webm)$/i) && (
            <video
              src={job.output_url}
              controls
              className="w-full rounded-md border border-slate-200"
            />
          )}
          <a
            href={job.output_url}
            download={job.output_filename ?? undefined}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Tải kết quả {job.file_size ? `(${(job.file_size / 1024 / 1024).toFixed(1)} MB)` : ""}
          </a>
          {job.duration !== null && (
            <p className="text-xs text-slate-400">Xử lý mất {job.duration.toFixed(1)}s</p>
          )}
        </div>
      )}

      {failed && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Thử lại
        </button>
      )}
    </section>
  );
}
