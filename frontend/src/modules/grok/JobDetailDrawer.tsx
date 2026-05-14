import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/core/api/axios";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface Log {
  level: string;
  message: string;
  context: Record<string, any> | null;
  created_at: string;
}

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
  created_at: string;
  completed_at: string | null;
  next_attempt_at?: string | null;
}

const ERROR_HINTS: Record<string, string> = {
  rate_limited: "Tài khoản Grok đang bị giới hạn tốc độ. Hệ thống sẽ tự retry sau 2-30 phút, hoặc thử lại với profile khác.",
  cookie_expired: "Phiên đăng nhập Grok hết hạn. Admin cần Auto-login lại profile.",
  captcha_required: "Grok yêu cầu giải captcha. Admin mở VNC để xác minh thủ công.",
  provider_blocked: "Tài khoản này không có quyền (cần Pro / Premium / Heavy).",
  browser_crashed: "Chromium crash. Hệ thống sẽ thử lại tự động.",
  network_error: "Lỗi mạng tạm thời. Hệ thống sẽ retry.",
  timeout: "Grok không trả kết quả trong thời gian cho phép. Có thể do tải cao — sẽ retry.",
  unknown_error: "Lỗi chưa xác định. Xem chi tiết log bên dưới.",
  unsupported_job_type: "Provider hiện không hỗ trợ loại job này.",
};

function parseErrorCode(msg: string | null): { code: string; rest: string } | null {
  if (!msg) return null;
  const m = msg.match(/^\[([a-z_]+)\]\s*(.*)$/);
  if (!m) return null;
  return { code: m[1], rest: m[2] };
}

/** Authed media: <img> can't send Authorization header. Fetch with axios (which
 *  attaches the JWT) and convert to a blob URL for display.
 */
function AuthedMedia({ url, fileName }: { url: string; fileName: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const r = await api.get(url, { responseType: "blob" });
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

  if (err) return <p className="text-rose-600 text-sm">Lỗi tải media: {err}</p>;
  if (!blobUrl) return <p className="text-ink-400 text-sm">Đang tải media…</p>;
  const isVideo = mime.startsWith("video/");
  return (
    <div className="space-y-2">
      {isVideo ? (
        <video src={blobUrl} controls muted playsInline className="max-w-full rounded border" />
      ) : (
        <img src={blobUrl} alt={fileName} className="max-w-full rounded border" />
      )}
      <a href={blobUrl} download={fileName} className="text-brand-600 text-sm hover:underline">
        ⬇ Tải xuống
      </a>
    </div>
  );
}

export function JobDetailDrawer({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { data: job } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => (await api.get<Job>(`/api/jobs/${jobId}`)).data,
    refetchInterval: (q) => {
      const s = (q.state.data as Job | undefined)?.status;
      return s && ["success", "failed", "cancelled", "expired"].includes(s) ? false : 3000;
    },
  });
  const { data: logs } = useQuery({
    queryKey: ["job-logs", jobId],
    queryFn: async () => (await api.get<Log[]>(`/api/jobs/${jobId}/logs`)).data,
    refetchInterval: 3000,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div className="w-full max-w-2xl bg-ink-900 shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Job detail</h2>
          <button className="text-ink-500 hover:text-ink-300" onClick={onClose}>✕</button>
        </div>
        {!job ? (
          <p className="p-6 text-ink-400">Đang tải...</p>
        ) : (
          <div className="flex-1 overflow-auto p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="ID"><code className="text-xs">{job.id}</code></Field>
              <Field label="Status"><StatusBadge status={job.status} /></Field>
              <Field label="Provider">{job.provider}</Field>
              <Field label="Type">{job.job_type}</Field>
              <Field label="Retry">{job.retry_count}</Field>
              <Field label="Created">{new Date(job.created_at).toLocaleString()}</Field>
              {job.completed_at && <Field label="Completed">{new Date(job.completed_at).toLocaleString()}</Field>}
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Prompt</div>
              <pre className="bg-ink-900 p-3 rounded text-xs whitespace-pre-wrap">{job.prompt}</pre>
            </div>
            {job.error_message && (() => {
              const parsed = parseErrorCode(job.error_message);
              const hint = parsed ? ERROR_HINTS[parsed.code] : null;
              const willRetry = job.status === "queued" && job.next_attempt_at;
              return (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-rose-600">Error</div>
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
                      Sẽ tự động retry lúc <strong>{new Date(job.next_attempt_at!).toLocaleTimeString()}</strong>
                      {typeof job.max_retry === "number" && ` (lần ${job.retry_count}/${job.max_retry})`}.
                    </div>
                  )}
                </div>
              );
            })()}
            {job.result_url && (
              <div>
                <div className="text-sm font-medium mb-1">Result</div>
                <AuthedMedia
                  url={job.result_url}
                  fileName={`${job.id}.bin`}
                />
              </div>
            )}
            <div>
              <div className="text-sm font-medium mb-1">Logs</div>
              <div className="bg-slate-900 text-slate-100 p-3 rounded text-xs font-mono space-y-1 max-h-80 overflow-auto">
                {logs?.length ? (
                  logs.map((l, i) => (
                    <div key={i} className={l.level === "error" ? "text-rose-300" : l.level === "warning" ? "text-amber-300" : ""}>
                      <span className="text-ink-400">{new Date(l.created_at).toLocaleTimeString()} </span>
                      [{l.level}] {l.message}
                    </div>
                  ))
                ) : (
                  <div className="text-ink-400">Chưa có log.</div>
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
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
