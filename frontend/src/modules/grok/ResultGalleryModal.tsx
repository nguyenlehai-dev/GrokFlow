import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, X, Play, Pause } from "lucide-react";
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
  jobType?: string;
  onClose: () => void;
}) {
  const { data: files = [], isLoading } = useQuery({
    queryKey: ["job-files", jobId],
    queryFn: async () => (await api.get<JobFile[]>(`/api/jobs/${jobId}/files`)).data,
  });
  const [idx, setIdx] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const cur = files[idx];
  const blob = useBlobUrl(cur?.download_url ?? null);

  const next = () => setIdx((i) => (files.length ? (i + 1) % files.length : 0));
  const prev = () => setIdx((i) => (files.length ? (i - 1 + files.length) % files.length : 0));

  // Auto-advance — only for image-only galleries (videos play through their own controls)
  const allImages = files.length > 0 && files.every((f) =>
    (f.mime_type || "").startsWith("image/"),
  );
  useEffect(() => {
    if (!autoPlay || files.length < 2 || !allImages) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % files.length);
    }, 3000);
    return () => clearInterval(id);
  }, [autoPlay, files.length, allImages]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape") onClose();
      if (e.key === " ") { e.preventDefault(); setAutoPlay((a) => !a); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [files.length]);

  // Touch swipe support
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx > 0) prev(); else next();
    }
    touchStartX.current = null;
  };

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
            <div className="text-xs text-ink-500">
              {files.length > 0 && (
                <>
                  Ảnh <span className="font-mono">{idx + 1}</span> / <span className="font-mono">{files.length}</span>
                </>
              )}
              {cur && ` • ${fmtSize(cur.file_size)}`}
              {cur && ` • ${cur.mime_type}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {files.length > 1 && allImages && (
              <button
                onClick={() => setAutoPlay((a) => !a)}
                className="p-2 rounded hover:bg-ink-900/10"
                title={autoPlay ? "Tạm dừng slideshow (Space)" : "Phát slideshow tự động (Space)"}
              >
                {autoPlay ? <Pause size={18} /> : <Play size={18} />}
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded hover:bg-ink-900/10" title="Đóng (Esc)">
              <X size={20} />
            </button>
          </div>
        </div>

        <div
          className="flex-1 relative bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center min-h-[400px] select-none"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {isLoading && <p className="text-ink-500">Đang tải danh sách file…</p>}
          {!isLoading && files.length === 0 && (
            <p className="text-ink-500">Job này chưa có file kết quả.</p>
          )}
          {cur && !blob && <p className="text-ink-500">Đang tải media…</p>}
          {cur && blob && (() => {
            const isVideo = (cur.mime_type || "").startsWith("video/")
              || (cur.file_type === "video" && !(cur.mime_type || "").startsWith("image/"));
            return isVideo ? (
              <video
                key={cur.id}
                src={blob}
                controls
                autoPlay
                muted
                playsInline
                className="max-h-[80vh] max-w-full"
              />
            ) : (
              <img
                key={cur.id}
                src={blob}
                alt={cur.file_name}
                className="max-h-[80vh] max-w-full object-contain transition-opacity duration-200"
                draggable={false}
              />
            );
          })()}

          {files.length > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition"
                aria-label="Previous (←)"
              >
                <ChevronLeft size={28} />
              </button>
              <button
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition"
                aria-label="Next (→)"
              >
                <ChevronRight size={28} />
              </button>

              {/* Slide indicator dots */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {files.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      i === idx ? "bg-ink-900 w-6" : "bg-ink-900/40 hover:bg-ink-900/70"
                    }`}
                    aria-label={`Đến ảnh ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Thumbnails strip */}
        {files.length > 1 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {files.map((f, i) => (
              <Thumb key={f.id} file={f} active={i === idx} onClick={() => setIdx(i)} idx={i + 1} />
            ))}
          </div>
        )}

        {/* Download — current + all */}
        {cur && blob && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <a
              href={blob}
              download={cur.file_name}
              className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded-md font-medium"
            >
              <Download size={18} /> Tải ảnh hiện tại
            </a>
            {files.length > 1 && (
              <DownloadAllButton files={files} />
            )}
          </div>
        )}

        {files.length > 1 && (
          <p className="text-xs text-ink-500 text-center mt-2">
            ← → chuyển ảnh • Space play/pause • Esc đóng • vuốt trái/phải trên mobile
          </p>
        )}
      </div>
    </div>
  );
}

function Thumb({ file, active, onClick, idx }: { file: JobFile; active: boolean; onClick: () => void; idx: number }) {
  const blob = useBlobUrl(file.download_url);
  return (
    <button
      onClick={onClick}
      className={`relative flex-shrink-0 w-20 h-20 rounded border-2 overflow-hidden transition ${
        active ? "border-brand-500" : "border-transparent opacity-60 hover:opacity-100"
      }`}
      title={file.file_name}
    >
      {blob ? (
        (file.mime_type || "").startsWith("video/") ? (
          <video src={blob} className="w-full h-full object-cover" muted playsInline />
        ) : (
          <img src={blob} className="w-full h-full object-cover" alt="" draggable={false} />
        )
      ) : (
        <div className="w-full h-full bg-slate-700 animate-pulse" />
      )}
      <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[10px] font-mono px-1 rounded">
        {idx}
      </span>
    </button>
  );
}

function DownloadAllButton({ files }: { files: JobFile[] }) {
  const [busy, setBusy] = useState(false);
  const downloadAll = async () => {
    setBusy(true);
    try {
      // Sequential to avoid hammering the server / browser concurrent-download cap
      for (const f of files) {
        const r = await api.get(f.download_url, { responseType: "blob" });
        const url = URL.createObjectURL(r.data);
        const a = document.createElement("a");
        a.href = url;
        a.download = f.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        // small delay so browser doesn't bunch downloads into a single zip prompt
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={downloadAll}
      disabled={busy}
      className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-5 py-2 rounded-md font-medium disabled:opacity-60"
    >
      <Download size={18} /> {busy ? "Đang tải…" : `Tải tất cả (${files.length})`}
    </button>
  );
}
