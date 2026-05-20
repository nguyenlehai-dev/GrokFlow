import { useState } from "react";
import {
  Image as ImageIcon, Film, Globe, User as UserIcon, Layers,
  Calendar, Copy, Check, ExternalLink,
} from "lucide-react";
import type { GalleryItem } from "../models/gallery";
import { useInView, VideoThumb } from "./GalleryHelpers";

export function GalleryPromptList({
  items, onPreview, isSuper,
}: { items: GalleryItem[]; onPreview: (i: GalleryItem) => void; isSuper: boolean }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <PromptRow key={item.job_id} item={item} onPreview={() => onPreview(item)} isSuper={isSuper} />
      ))}
    </div>
  );
}

function PromptRow({
  item, onPreview, isSuper,
}: { item: GalleryItem; onPreview: () => void; isSuper: boolean }) {
  const [copied, setCopied] = useState(false);
  const isVideo = item.job_type === "video";
  const { ref, inView } = useInView<HTMLDivElement>("400px");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div ref={ref} className="card-hover flex gap-4 p-4">
      {/* Thumbnail */}
      <button
        type="button"
        onClick={onPreview}
        className="relative shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-slate-100 ring-1 ring-slate-200 hover:ring-2 hover:ring-blue-400 transition"
      >
        {!inView ? (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200" />
        ) : isVideo ? (
          <VideoThumb url={item.result_url} />
        ) : (
          <img
            src={item.result_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <span
          className={`absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold backdrop-blur-sm ${
            isVideo ? "bg-accent-fuchsia/90 text-white" : "bg-brand-600/90 text-white"
          }`}
        >
          {isVideo ? <Film size={8} /> : <ImageIcon size={8} />}
        </span>
      </button>

      {/* Prompt body */}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-900 leading-snug">{item.prompt || <i className="text-slate-500">(không có prompt)</i>}</p>
        <div className="flex items-center gap-2.5 mt-2 text-xs text-slate-9000 flex-wrap">
          {isSuper && item.domain_hostname && (
            <span className="badge-brand inline-flex items-center gap-1">
              <Globe size={10} /> {item.domain_brand_name || item.domain_hostname}
            </span>
          )}
          {item.user_email && (
            <span className="inline-flex items-center gap-1">
              <UserIcon size={11} /> {item.user_email}
            </span>
          )}
          {item.profile_name && (
            <span className="inline-flex items-center gap-1 font-mono">
              <Layers size={11} /> {item.profile_name}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Calendar size={11} /> {new Date(item.created_at).toLocaleString("vi-VN")}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5 shrink-0">
        <button
          type="button"
          onClick={copy}
          className="btn-secondary btn-sm"
          title="Copy prompt"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Đã copy" : "Copy"}
        </button>
        <button
          type="button"
          onClick={onPreview}
          className="btn-ghost btn-sm"
        >
          <ExternalLink size={13} /> Xem
        </button>
      </div>
    </div>
  );
}
