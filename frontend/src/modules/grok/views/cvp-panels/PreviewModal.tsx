// In-app preview modal for image/video results.
//
// Why an in-app modal instead of window.open(blobUrl):
//   - Electron's window-open handler routes external URLs to shell.openExternal,
//     and blob: URLs are session-scoped — they're useless once handed off to
//     the OS. Net result was a broken "Xem" button in the desktop build.
//   - An in-app modal also keeps the user inside the workspace flow; we
//     don't lose focus, log scroll position, or batch state.
//
// The modal fetches the file via axios (with the JWT) → blob URL →
// renders `<img>` or `<video>` directly. Closing the modal revokes the
// blob to avoid memory leaks on long sessions.

import { X, Download, ExternalLink, Loader2 } from "lucide-react";
import { useAuthedMediaUrl } from "./hooks";
import { downloadAuthed } from "./media";

interface PreviewModalProps {
  url: string | null;
  /** "image" or "video" — drives whether we render <img> or <video>. */
  kind: "image" | "video";
  filename?: string;
  /** Optional prompt to show as caption. */
  caption?: string;
  onClose: () => void;
}

export function PreviewModal({ url, kind, filename, caption, onClose }: PreviewModalProps) {
  const blobUrl = useAuthedMediaUrl(url);
  if (!url) return null;

  return (
    <div
      // Modal "contained" trong main column thay vì che cả app. `left`
      // đọc từ CSS var --cvp-main-left set ở CreateVideoProPage outer:
      // bằng width sidebar khi sidebar mở (16rem), 0 khi đóng. Fallback
      // = 0 nếu render ngoài context CVP (modal vẫn full-viewport).
      className="fixed top-0 right-0 bottom-0 z-[100] grid place-items-center bg-black/85 backdrop-blur-sm p-4"
      style={{ left: "var(--cvp-main-left, 0px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative cvp-card max-w-5xl w-full max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono text-cyan-300/80 truncate">
              {filename ?? url.split("/").filter(Boolean).pop()}
            </div>
            {caption && (
              <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1" title={caption}>
                {caption}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => downloadAuthed(url, filename)}
              className="cvp-btn-teal inline-flex items-center gap-1 text-[10px] px-2.5 py-1"
              title="Tải file"
            >
              <Download size={11} /> Tải
            </button>
            <button
              onClick={() => {
                if (blobUrl) window.open(blobUrl, "_blank", "noreferrer");
              }}
              disabled={!blobUrl}
              className="cvp-btn-ghost inline-flex items-center gap-1 text-[10px] px-2.5 py-1 disabled:opacity-40"
              title="Mở ngoài (popup)"
            >
              <ExternalLink size={11} />
            </button>
            <button
              onClick={onClose}
              className="cvp-btn-ghost inline-flex items-center text-[10px] px-2 py-1"
              title="Đóng (Esc)"
            >
              <X size={12} />
            </button>
          </div>
        </header>

        <div className="flex-1 grid place-items-center bg-black/40 p-4 overflow-auto">
          {!blobUrl ? (
            <div className="text-slate-400 text-xs inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Đang tải...
            </div>
          ) : kind === "video" ? (
            <video
              src={blobUrl}
              controls
              autoPlay
              className="max-w-full max-h-[80vh] rounded-md shadow-2xl"
            />
          ) : (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img
              src={blobUrl}
              className="max-w-full max-h-[80vh] rounded-md shadow-2xl object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
