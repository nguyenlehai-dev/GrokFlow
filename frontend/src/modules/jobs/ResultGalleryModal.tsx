import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { api } from "@/core/api/axios";

interface JobFile {
  id: string;
  file_name: string;
  file_type: string;
  mime_type: string | null;
  file_size: number | null;
  download_url: string;
}

function useBlobUrl(url: string | null) {
  const [blob, setBlob] = useState<string | null>(null);
  useEffect(() => {
    if (!url) { setBlob(null); return; }
    let cancelled = false;
    let created: string | null = null;
    (async () => {
      try {
        const r = await api.get(url, { responseType: "blob" });
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

export function ResultGalleryModal({
  jobId,
  onClose,
}: {
  jobId: string;
  jobType?: string;  // kept for caller backward-compat; render decides per-file mime
  onClose: () => void;
}) {
  const { data: files = [], isLoading } = useQuery({
    queryKey: ["job-files", jobId],
    queryFn: async () => (await api.get<JobFile[]>(`/api/jobs/${jobId}/files`)).data,
  });
  const [idx, setIdx] = useState(0);
  const cur = files[idx];
  const blob = useBlobUrl(cur?.download_url ?? null);

  const next = () => setIdx((i) => (files.length ? (i + 1) % files.length : 0));
  const prev = () => setIdx((i) => (files.length ? (i - 1 + files.length) % files.length : 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [files.length]);

  const fmtSize = (n: number | null) => {
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-4" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between text-white mb-3">
          <div>
            <div className="text-lg font-semibold">{cur?.file_name ?? "Result"}</div>
            <div className="text-xs text-slate-300">
              {files.length > 0 && `${idx + 1} / ${files.length}`}
              {cur && ` • ${fmtSize(cur.file_size)}`}
              {cur && ` • ${cur.mime_type}`}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 relative bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center min-h-[400px]">
          {isLoading && <p className="text-slate-400">Đang tải danh sách file…</p>}
          {!isLoading && files.length === 0 && (
            <p className="text-slate-400">Job này chưa có file kết quả.</p>
          )}
          {cur && !blob && <p className="text-slate-400">Đang tải media…</p>}
          {cur && blob && (() => {
            const isVideo = (cur.mime_type || "").startsWith("video/")
              || (cur.file_type === "video" && !(cur.mime_type || "").startsWith("image/"));
            return isVideo ? (
              <video
                src={blob}
                controls
                autoPlay
                muted
                playsInline
                className="max-h-[80vh] max-w-full"
              />
            ) : (
              <img src={blob} alt={cur.file_name} className="max-h-[80vh] max-w-full object-contain" />
            );
          })()}

          {files.length > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white"
                aria-label="Previous"
              >
                <ChevronLeft size={28} />
              </button>
              <button
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white"
                aria-label="Next"
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}
        </div>

        {/* Thumbnails */}
        {files.length > 1 && (
          <div className="flex gap-2 mt-3 overflow-x-auto">
            {files.map((f, i) => (
              <Thumb key={f.id} file={f} active={i === idx} onClick={() => setIdx(i)} />
            ))}
          </div>
        )}

        {/* Download */}
        {cur && blob && (
          <div className="mt-3 flex justify-center">
            <a
              href={blob}
              download={cur.file_name}
              className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded-md font-medium"
            >
              <Download size={18} /> Tải xuống {cur.file_name}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function Thumb({ file, active, onClick }: { file: JobFile; active: boolean; onClick: () => void }) {
  const blob = useBlobUrl(file.download_url);
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 w-20 h-20 rounded border-2 overflow-hidden ${
        active ? "border-brand-500" : "border-transparent opacity-60 hover:opacity-100"
      }`}
    >
      {blob ? (
        (file.mime_type || "").startsWith("video/") ? (
          <video src={blob} className="w-full h-full object-cover" muted playsInline />
        ) : (
          <img src={blob} className="w-full h-full object-cover" alt="" />
        )
      ) : (
        <div className="w-full h-full bg-slate-700 animate-pulse" />
      )}
    </button>
  );
}
