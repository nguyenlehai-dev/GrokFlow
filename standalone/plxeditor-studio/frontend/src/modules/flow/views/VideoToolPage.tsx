import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { FlowShell } from "../components/FlowShell";
import { DropZoneView } from "../components/DropZoneView";
import { OperationSyntax } from "../components/OperationSyntax";
import { UrlInput } from "../components/UrlInput";
import type { ToolDef } from "../configs/tools";
import {
  uploadInputs,
  uploadByUrls,
  runTool,
  getJob,
  retryJob,
  type FlowJob,
} from "../services/flow.service";

interface Props {
  tool: ToolDef;
}

/** Job IDs the current browser session owns. Persisted to localStorage so
 *  a reload doesn't lose ongoing jobs. Keyed by tool slug. */
const STORAGE_KEY = "flow.myJobs";

function rememberJob(toolSlug: string, jobId: string) {
  let all: Record<string, string[]> = {};
  try {
    all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    /* corrupted localStorage — reset */
  }
  all[toolSlug] = [jobId, ...(all[toolSlug] ?? []).filter((id) => id !== jobId)].slice(0, 20);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/* ────────────────────────────────────────────────────────────────────
 * Main page
 * ────────────────────────────────────────────────────────────────────*/

export function VideoToolPage({ tool }: Props) {
  const dual = !!tool.inputs.secondary;
  const [primaryFiles, setPrimaryFiles] = useState<File[]>([]);
  const [secondaryFiles, setSecondaryFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string | number | boolean>>(() => {
    const init: Record<string, string | number | boolean> = {};
    for (const f of tool.fields) if (f.default !== undefined) init[f.name] = f.default;
    return init;
  });
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<FlowJob | null>(null);
  const pollRef = useRef<number | null>(null);
  const isTerminal = job?.status === "completed" || job?.status === "failed";

  // Reset when the route swaps to a different tool (component is reused).
  useEffect(() => {
    setPrimaryFiles([]);
    setSecondaryFiles([]);
    setUrl("");
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

  // 2-second poll while the job is non-terminal. Easy on the BE because
  // the read path is just a GET to the upstream service's SQLite job row.
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

  const submit = useCallback(async () => {
    // Decide upload mode. Priority: pasted URL > local files. For dual-input
    // tools the URL field is intentionally cosmetic (which file is the URL
    // for? — ambiguous), so we always use files there.
    const useUrl = !dual && !!url.trim();

    if (useUrl) {
      // continue
    } else if (dual) {
      if (primaryFiles.length < 1 || secondaryFiles.length < 1) {
        toast("Cần cả video và audio file", "error");
        return;
      }
    } else {
      if (primaryFiles.length < tool.inputs.min) {
        toast(`Cần ít nhất ${tool.inputs.min} file`, "error");
        return;
      }
    }

    setSubmitting(true);
    setUploadPct(0);
    setJob(null);
    try {
      let init;
      if (useUrl) {
        init = await uploadByUrls(tool.slug, [url.trim()]);
      } else {
        const files = dual ? [...primaryFiles, ...secondaryFiles] : primaryFiles;
        init = await uploadInputs(tool.slug, files, setUploadPct);
      }
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
  }, [primaryFiles, secondaryFiles, url, fieldValues, tool, dual]);

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
    <FlowShell workspaceLabel={tool.shortLabel}>
      <div className="space-y-5">
        {/* Drop zones — primary always; secondary only for add-audio */}
        {dual && tool.inputs.secondary ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DropZoneView zone={tool.inputs.primary} files={primaryFiles} onFiles={setPrimaryFiles} />
            <DropZoneView zone={tool.inputs.secondary} files={secondaryFiles} onFiles={setSecondaryFiles} />
          </div>
        ) : (
          <DropZoneView zone={tool.inputs.primary} files={primaryFiles} onFiles={setPrimaryFiles} />
        )}

        {tool.inputs.acceptUrlInput && !dual && (
          <UrlInput value={url} onChange={setUrl} />
        )}

        <OperationSyntax
          tool={tool}
          values={fieldValues}
          onChange={(k, v) => setFieldValues((prev) => ({ ...prev, [k]: v }))}
        />

        {/* Upload progress — only shown during the upload phase */}
        {submitting && uploadPct > 0 && uploadPct < 100 && (
          <div>
            <p className="mb-1 text-xs text-slate-500">Uploading: {uploadPct}%</p>
            <div className="h-1.5 w-full overflow-hidden rounded bg-slate-100">
              <div
                className="h-full bg-violet-500 transition-all"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-7 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-indigo-400 disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-9000 disabled:shadow-none"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
            Ignite Process
          </button>
        </div>

        {job && <JobCard job={job} onRetry={handleRetry} />}
      </div>
    </FlowShell>
  );
}

function JobCard({ job, onRetry }: { job: FlowJob; onRetry: () => void }) {
  const done = job.status === "completed";
  const failed = job.status === "failed";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {done && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          {failed && <AlertCircle className="h-5 w-5 text-rose-500" />}
          {!done && !failed && <Loader2 className="h-5 w-5 animate-spin text-violet-500" />}
          <div>
            <h3 className="text-sm font-semibold text-white">Job {job.id.slice(0, 8)}</h3>
            <p className="text-[11px] text-slate-500">
              {new Date(job.created_at).toLocaleString("vi-VN")}
            </p>
          </div>
        </div>
        <span
          className={[
            "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            done && "bg-emerald-100 text-emerald-700",
            failed && "bg-rose-100 text-rose-700",
            !done && !failed && "bg-violet-100 text-violet-700",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {job.status}
        </span>
      </header>

      {!done && !failed && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>Progress</span>
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

      {failed && job.error_message && (
        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {job.error_message}
        </p>
      )}

      {done && job.output_url && (
        <div className="mt-4 space-y-3">
          {job.output_url.match(/\.(mp4|mov|webm)$/i) && (
            <video src={job.output_url} controls className="w-full rounded-lg border border-slate-200" />
          )}
          <a
            href={job.output_url}
            download={job.output_filename ?? undefined}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-400 hover:text-violet-700"
          >
            <Download className="h-4 w-4" />
            Tải kết quả {job.file_size ? `(${(job.file_size / 1024 / 1024).toFixed(1)} MB)` : ""}
          </a>
          {job.duration !== null && (
            <p className="text-[11px] text-slate-500">Xử lý mất {job.duration.toFixed(1)}s</p>
          )}
        </div>
      )}

      {failed && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-violet-400 hover:text-violet-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Thử lại
        </button>
      )}
    </div>
  );
}
