import { useEffect } from "react";
import {
  X, Download, ExternalLink, Calendar, User as UserIcon, Layers,
  Film, Globe, Image as ImageIcon,
} from "lucide-react";
import type { GalleryItem } from "../models/gallery";

export function GalleryPreviewModal({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="max-w-5xl w-full bg-white rounded-2xl overflow-hidden flex flex-col max-h-[92vh] shadow-card-hover animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-100">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 truncate">
              {item.prompt || "(không có prompt)"}
            </p>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-9000 flex-wrap">
              <span className="inline-flex items-center gap-1">
                {item.job_type === "video" ? <Film size={11} /> : <ImageIcon size={11} />}
                {item.job_type}
              </span>
              {item.domain_hostname && (
                <span className="badge-brand inline-flex items-center gap-1 text-[10px]">
                  <Globe size={10} /> {item.domain_brand_name || item.domain_hostname}
                </span>
              )}
              {item.profile_name && (
                <span className="inline-flex items-center gap-1">
                  <Layers size={11} /> {item.profile_name}
                </span>
              )}
              {item.user_email && (
                <span className="inline-flex items-center gap-1">
                  <UserIcon size={11} /> {item.user_email}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Calendar size={11} /> {new Date(item.created_at).toLocaleString("vi-VN")}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex-shrink-0 ml-3"
            title="Đóng (Esc)"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-6">
          {item.job_type === "video" ? (
            <video
              src={item.result_url}
              controls
              autoPlay
              loop
              className="max-w-full max-h-[70vh] rounded-lg shadow-card-hover"
            />
          ) : (
            <img
              src={item.result_url}
              alt={item.prompt}
              className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-card-hover"
            />
          )}
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 bg-white flex justify-between items-center text-xs">
          <code className="font-mono text-slate-9000">{item.job_id.slice(0, 8)}</code>
          <div className="flex gap-2">
            <a
              href={item.result_url}
              download
              className="btn-secondary btn-sm"
            >
              <Download size={14} /> Tải về
            </a>
            <a
              href={item.result_url}
              target="_blank"
              rel="noreferrer"
              className="btn-primary btn-sm"
            >
              <ExternalLink size={14} /> Mở tab mới
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
