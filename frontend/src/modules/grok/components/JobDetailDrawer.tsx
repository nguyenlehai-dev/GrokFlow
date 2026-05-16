import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Job, JobLog } from "../models/job";
import { jobsService } from "../services/jobs.service";
import { filesService } from "../services/files.service";
import { ERROR_HINTS, parseErrorCode } from "../utils/jobError";

/** Authed media: <img> can't send Authorization header. Fetch with axios (which
 *  attaches the JWT) and convert to a blob URL for display.
 */
function AuthedMedia({ url, fileName }: { url: string; fileName: string }) {
  const { t } = useTranslation();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const r = await filesService.downloadBlob(url);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(r.data);
        setBlobUrl(createdUrl);
        setMime(r.data.type || r.headers["content-type"] || "");
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  if (err) return <p className="text-rose-600 text-sm">{t("grok.job_detail_media_error", { error: err })}</p>;
  if (!blobUrl) return <p className="text-slate-500 text-sm">{t("grok.job_detail_loading_media")}</p>;
  const isVideo = mime.startsWith("video/");
  return (
    <div className="space-y-2">
      {isVideo ? (
        <video src={blobUrl} controls muted playsInline className="max-w-full rounded border" />
      ) : (
        <img src={blobUrl} alt={fileName} className="max-w-full rounded border" />
      )}
      <a href={blobUrl} download={fileName} className="text-brand-600 text-sm hover:underline">
        {t("grok.job_detail_download")}
      </a>
    </div>
  );
}

export function JobDetailDrawer({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: job } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => jobsService.get(jobId),
    refetchInterval: (q) => {
      const s = (q.state.data as Job | undefined)?.status;
      return s && ["success", "failed", "cancelled", "expired"].includes(s) ? false : 3000;
    },
  });
  const { data: logs } = useQuery<JobLog[]>({
    queryKey: ["job-logs", jobId],
    queryFn: () => jobsService.logs(jobId),
    refetchInterval: 3000,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{t("grok.job_detail_title")}</h2>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose}>✕</button>
        </div>
        {!job ? (
          <p className="p-6 text-slate-500">{t("grok.job_detail_loading")}</p>
        ) : (
          <div className="flex-1 overflow-auto p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label={t("grok.job_detail_field_id")}><code className="text-xs">{job.id}</code></Field>
              <Field label={t("grok.job_detail_field_status")}><StatusBadge status={job.status} /></Field>
              <Field label={t("grok.job_detail_field_provider")}>{job.provider}</Field>
              <Field label={t("grok.job_detail_field_type")}>{job.job_type}</Field>
              <Field label={t("grok.job_detail_field_retry")}>{job.retry_count}</Field>
              <Field label={t("grok.job_detail_field_created")}>{new Date(job.created_at).toLocaleString()}</Field>
              {job.completed_at && <Field label={t("grok.job_detail_field_completed")}>{new Date(job.completed_at).toLocaleString()}</Field>}
            </div>
            <div>
              <div className="text-sm font-medium mb-1">{t("grok.job_detail_prompt")}</div>
              <pre className="bg-white p-3 rounded text-xs whitespace-pre-wrap">{job.prompt}</pre>
            </div>
            {job.error_message && (() => {
              const parsed = parseErrorCode(job.error_message);
              const hint = parsed ? ERROR_HINTS[parsed.code] : null;
              const willRetry = job.status === "queued" && job.next_attempt_at;
              return (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-rose-600">{t("grok.job_detail_error")}</div>
                  {parsed && (
                    <div className="bg-rose-50 border border-rose-200 rounded p-3 space-y-1">
                      <div className="text-xs uppercase tracking-wide text-rose-600 font-semibold">{parsed.code}</div>
                      {hint && <div className="text-sm text-rose-900">{hint}</div>}
                      <div className="text-xs text-rose-700">{parsed.rest}</div>
                    </div>
                  )}
                  {!parsed && (
                    <pre className="bg-rose-50 text-rose-800 p-3 rounded text-xs whitespace-pre-wrap">{job.error_message}</pre>
                  )}
                  {willRetry && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      {t("grok.job_detail_retry_prefix")} <strong>{new Date(job.next_attempt_at!).toLocaleTimeString()}</strong>
                      {typeof job.max_retry === "number" && ` ${t("grok.job_detail_retry_attempt", { current: job.retry_count, max: job.max_retry })}`}.
                    </div>
                  )}
                </div>
              );
            })()}
            {job.result_url && (
              <div>
                <div className="text-sm font-medium mb-1">{t("grok.job_detail_result")}</div>
                <AuthedMedia
                  url={job.result_url}
                  fileName={`${job.id}.bin`}
                />
              </div>
            )}
            <div>
              <div className="text-sm font-medium mb-1">{t("grok.job_detail_logs")}</div>
              <div className="bg-slate-900 text-slate-100 p-3 rounded text-xs font-mono space-y-1 max-h-80 overflow-auto">
                {logs?.length ? (
                  logs.map((l, i) => (
                    <div key={i} className={l.level === "error" ? "text-rose-700" : l.level === "warning" ? "text-amber-700" : ""}>
                      <span className="text-slate-500">{new Date(l.created_at).toLocaleTimeString()} </span>
                      [{l.level}] {l.message}
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500">{t("grok.job_detail_no_logs")}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
