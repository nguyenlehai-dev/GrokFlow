import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { Job, JobFile } from "../models/job";
import { jobsService } from "../services/jobs.service";
import { filesService } from "../services/files.service";

function useBlobUrl(url: string | null) {
  const [blob, setBlob] = useState<string | null>(null);
  useEffect(() => {
    if (!url) { setBlob(null); return; }
    let cancelled = false;
    let created: string | null = null;
    (async () => {
      try {
        const r = await filesService.downloadBlob(url);
        if (cancelled) return;
        created = URL.createObjectURL(r.data);
        setBlob(created);
      } catch {
        if (!cancelled) setBlob(null);
      }
    })();
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
  }, [url]);
  return blob;
}

/** Side-by-side compare of 2-4 jobs.
 *  Shows each job's first output file as a thumbnail with the prompt
 *  underneath. No bulk actions — purely visual diff. Operators use this
 *  to A/B different prompts that ran on the same reference image. */
export function CompareJobsModal({
  jobs,
  onClose,
}: {
  jobs: Job[];
  onClose: () => void;
}) {
  const cols =
    jobs.length === 1 ? "grid-cols-1" :
    jobs.length === 2 ? "grid-cols-2" :
    jobs.length === 3 ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-7xl max-h-[90vh] bg-white rounded-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">
            So sánh {jobs.length} job
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-100"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>
        <div className={`grid ${cols} gap-4 p-5 overflow-auto`}>
          {jobs.map((j) => <CompareCell key={j.id} job={j} />)}
        </div>
      </div>
    </div>
  );
}

function CompareCell({ job }: { job: Job }) {
  const { data: files } = useQuery<JobFile[]>({
    queryKey: ["job-files", job.id],
    queryFn: () => jobsService.files(job.id),
    enabled: job.status === "success",
  });
  const first = files?.[0];
  return (
    <div className="border border-slate-200 rounded-lg p-3 flex flex-col gap-2">
      <div className="aspect-square bg-slate-100 rounded overflow-hidden flex items-center justify-center">
        {first
          ? <Thumb file={first} />
          : <span className="text-xs text-slate-400">
              {job.status === "success" ? "Loading…" : `(${job.status})`}
            </span>}
      </div>
      <div className="text-xs text-slate-500 font-mono">{job.id.slice(0, 8)}</div>
      <div className="text-xs text-slate-700 line-clamp-4">{job.prompt}</div>
      <div className="text-[11px] text-slate-400 mt-auto">
        {job.provider}/{job.job_type} • {new Date(job.created_at).toLocaleString()}
      </div>
    </div>
  );
}

function Thumb({ file }: { file: JobFile }) {
  const blob = useBlobUrl(file.download_url);
  if (!blob) return <span className="text-xs text-slate-400">…</span>;
  const isVideo = (file.mime_type ?? "").startsWith("video/");
  return isVideo ? (
    <video src={blob} controls className="w-full h-full object-contain" />
  ) : (
    <img src={blob} alt={file.file_name} className="w-full h-full object-contain" />
  );
}
