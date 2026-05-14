import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Image as ImageIcon, Video as VideoIcon, Search, ChevronLeft, ChevronRight,
  X, Download, ExternalLink, Calendar, User as UserIcon, Layers,
  Sparkles, Film, Wand2,
} from "lucide-react";

import { api } from "@/core/api/axios";

interface GalleryItem {
  job_id: string;
  job_type: "image" | "video";
  provider: string;
  prompt: string;
  result_url: string;
  profile_name: string | null;
  user_email: string | null;
  created_at: string;
  completed_at: string | null;
}

interface GalleryPageOut {
  items: GalleryItem[];
  total: number;
  offset: number;
  limit: number;
}

const PAGE_SIZE = 24;

type TypeFilter = "" | "image" | "video";

const TYPE_CHIPS: { v: TypeFilter; label: string; icon: any; tone: string }[] = [
  { v: "", label: "Tất cả", icon: Sparkles, tone: "violet" },
  { v: "image", label: "Ảnh", icon: ImageIcon, tone: "cyan" },
  { v: "video", label: "Video", icon: Film, tone: "fuchsia" },
];

export function GalleryPage() {
  const [jobType, setJobType] = useState<TypeFilter>("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [preview, setPreview] = useState<GalleryItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["gallery", jobType, offset],
    queryFn: async () => {
      const params: Record<string, string | number> = { offset, limit: PAGE_SIZE };
      if (jobType) params.job_type = jobType;
      return (await api.get<GalleryPageOut>("/api/gallery", { params })).data;
    },
    // Same media list rarely changes; cache 30s so back/forward feels instant.
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    if (!search.trim()) return items;
    const needle = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        i.prompt.toLowerCase().includes(needle) ||
        (i.user_email ?? "").toLowerCase().includes(needle) ||
        (i.profile_name ?? "").toLowerCase().includes(needle)
    );
  }, [data, search]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // Quick counts for the hero header — derived from current page only;
  // accurate global counts come from a separate API call that we don't
  // need to make right now.
  const onPageImages = filtered.filter((i) => i.job_type === "image").length;
  const onPageVideos = filtered.filter((i) => i.job_type === "video").length;

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="rounded-xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 text-white p-6 shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80 font-semibold">
              Grok Gallery
            </p>
            <h1 className="text-2xl font-bold mt-0.5 flex items-center gap-2">
              <Wand2 size={24} /> Bộ sưu tập media
            </h1>
            <p className="text-sm opacity-90 mt-1">
              {total > 0
                ? `${total.toLocaleString()} kết quả — ảnh và video do Grok render`
                : "Khi job thành công, ảnh/video sẽ xuất hiện ở đây"}
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <Badge icon={ImageIcon}>{onPageImages} ảnh trang này</Badge>
            <Badge icon={Film}>{onPageVideos} video trang này</Badge>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center rounded-md border border-slate-300 px-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              className="w-full bg-transparent px-2 py-2 text-sm outline-none"
              placeholder="Tìm theo prompt, user, profile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-slate-400 hover:text-slate-700"
                title="Xóa tìm kiếm"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-1.5">
          {TYPE_CHIPS.map((c) => (
            <button
              key={c.v}
              onClick={() => { setJobType(c.v); setOffset(0); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition ${
                jobType === c.v
                  ? `bg-${c.tone}-600 text-white border-${c.tone}-600`
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
              // Tailwind JIT won't generate dynamic class names; map manually
              style={
                jobType === c.v
                  ? c.tone === "violet"
                    ? { background: "#7c3aed", borderColor: "#7c3aed", color: "white" }
                    : c.tone === "cyan"
                    ? { background: "#0891b2", borderColor: "#0891b2", color: "white" }
                    : { background: "#c026d3", borderColor: "#c026d3", color: "white" }
                  : undefined
              }
            >
              <c.icon size={13} /> {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid / empty / loading */}
      {isLoading && !data ? (
        <SkeletonGrid />
      ) : filtered.length === 0 ? (
        <EmptyState hasData={total > 0} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filtered.map((item) => (
            <GalleryCell key={item.job_id} item={item} onClick={() => setPreview(item)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-600 pt-2">
          <span>
            {(offset + 1).toLocaleString()}–{Math.min(offset + PAGE_SIZE, total).toLocaleString()} / {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost border border-slate-300 inline-flex items-center gap-0.5 px-2"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" /> Trước
            </button>
            <span className="px-3 text-sm font-medium">
              Trang {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="btn-ghost border border-slate-300 inline-flex items-center gap-0.5 px-2"
              onClick={() => setOffset(Math.min((totalPages - 1) * PAGE_SIZE, offset + PAGE_SIZE))}
              disabled={currentPage >= totalPages}
            >
              Sau <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {preview && <PreviewModal item={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Badge({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 font-mono">
      <Icon size={12} /> {children}
    </span>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-lg bg-slate-100 animate-pulse"
          style={{ animationDelay: `${i * 50}ms` }}
        />
      ))}
    </div>
  );
}

function EmptyState({ hasData }: { hasData: boolean }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white py-16 px-6 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-violet-50 flex items-center justify-center">
        <Wand2 size={24} className="text-violet-500" />
      </div>
      <h3 className="mt-3 font-semibold text-slate-800">
        {hasData ? "Không có item nào khớp filter" : "Chưa có media nào"}
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        {hasData
          ? "Thử bỏ filter hoặc xóa từ khóa tìm kiếm."
          : "Submit job ảnh/video và đợi Grok render — kết quả sẽ tự xuất hiện ở đây."}
      </p>
    </div>
  );
}

function GalleryCell({ item, onClick }: { item: GalleryItem; onClick: () => void }) {
  const isVideo = item.job_type === "video";
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative rounded-lg overflow-hidden bg-slate-100 aspect-square ring-1 ring-slate-200 hover:ring-2 hover:ring-violet-500 hover:shadow-lg transition focus:outline-none focus:ring-2 focus:ring-violet-500"
    >
      {isVideo ? (
        <VideoThumb url={item.result_url} />
      ) : (
        <img
          src={item.result_url}
          alt={item.prompt.slice(0, 60)}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            // If signed token expired, hide image gracefully.
            (e.target as HTMLImageElement).style.opacity = "0.2";
          }}
        />
      )}
      {/* Type badge top-right */}
      <span
        className={`absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${
          isVideo ? "bg-fuchsia-600/90 text-white" : "bg-violet-600/90 text-white"
        }`}
      >
        {isVideo ? <Film size={9} /> : <ImageIcon size={9} />}
        {isVideo ? "VIDEO" : "ẢNH"}
      </span>
      {/* Hover overlay with prompt + meta */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 opacity-0 group-hover:opacity-100 transition pointer-events-none">
        <p className="text-xs text-white line-clamp-2 leading-tight">{item.prompt}</p>
        {item.profile_name && (
          <p className="text-[10px] text-white/70 mt-1 font-mono">{item.profile_name}</p>
        )}
      </div>
    </button>
  );
}

/** Renders the first frame of a video as a still thumbnail.
 *  Browsers usually pull just the metadata + first few frames when
 *  `preload="metadata"` is set, so this is cheap. */
function VideoThumb({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-fuchsia-100 to-rose-100">
          <Film size={28} className="text-fuchsia-400" />
        </div>
      )}
      <video
        ref={ref}
        src={`${url}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        onLoadedData={() => setLoaded(true)}
        onError={() => setLoaded(false)}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-10 h-10 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center group-hover:bg-white/50 transition">
          <div className="border-l-[10px] border-l-white border-y-[6px] border-y-transparent ml-1" />
        </div>
      </div>
    </>
  );
}

function PreviewModal({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  // Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="max-w-5xl w-full bg-white rounded-xl overflow-hidden flex flex-col max-h-[92vh] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 truncate">{item.prompt || "(không có prompt)"}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
              <span className="inline-flex items-center gap-1">
                {item.job_type === "video" ? <Film size={11} /> : <ImageIcon size={11} />}
                {item.job_type}
              </span>
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
            className="rounded-md p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 flex-shrink-0 ml-3"
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
              className="max-w-full max-h-[70vh] rounded-lg shadow-xl"
            />
          ) : (
            <img
              src={item.result_url}
              alt={item.prompt}
              className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-xl"
            />
          )}
        </div>

        <footer className="px-5 py-3 border-t border-slate-200 bg-white flex justify-between items-center text-xs">
          <code className="font-mono text-slate-500">{item.job_id.slice(0, 8)}</code>
          <div className="flex gap-2">
            <a
              href={item.result_url}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
            >
              <Download size={14} /> Tải về
            </a>
            <a
              href={item.result_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 text-white font-medium"
            >
              <ExternalLink size={14} /> Mở tab mới
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
