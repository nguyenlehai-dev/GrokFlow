import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, Search, ChevronLeft, ChevronRight, X } from "lucide-react";

import { api } from "@/core/api/axios";

interface GalleryItem {
  job_id: string;
  job_type: string;
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

const PAGE_SIZE = 30;

/** Grok media gallery — grid of every successful Grok generation.
 *
 *  Filters: job_type (image/video), profile, free-text search across
 *  prompt / user email. Server-side pagination (30 / page) handled via
 *  offset + limit. Cell click opens a lightbox-style overlay with full
 *  media + the prompt that produced it.
 */
export function GalleryPage() {
  const [jobType, setJobType] = useState<"image" | "video" | "">("");
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
  });

  // Client-side filter for search (BE doesn't support free-text yet —
  // small enough page that it's fine).
  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    if (!search) return items;
    const needle = search.toLowerCase();
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

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ImageIcon size={22} className="text-cyan-600" /> Grok Gallery
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Tất cả ảnh/video Grok đã render thành công. {total.toLocaleString()} item.
        </p>
      </header>

      {/* Filter bar */}
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <label className="flex-1 min-w-[200px]">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
          <div className="mt-1 flex items-center rounded-md border border-slate-300 px-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              className="w-full bg-transparent px-2 py-1.5 text-sm outline-none"
              placeholder="Prompt, user, profile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </label>
        <label className="block min-w-[150px]">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</span>
          <select
            className="input mt-1 w-full text-sm"
            value={jobType}
            onChange={(e) => {
              setJobType(e.target.value as "image" | "video" | "");
              setOffset(0);
            }}
          >
            <option value="">Tất cả</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </label>
      </div>

      {isLoading && !data ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12 text-sm text-slate-500">
          {total === 0
            ? "Chưa có job nào thành công có media."
            : "Không có item nào khớp filter."}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((item) => (
            <GalleryCell key={item.job_id} item={item} onClick={() => setPreview(item)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-600 pt-2">
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost inline-flex items-center gap-0.5 px-2"
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
              className="btn-ghost inline-flex items-center gap-0.5 px-2"
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

function GalleryCell({ item, onClick }: { item: GalleryItem; onClick: () => void }) {
  const isVideo = item.job_type === "video";
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 aspect-square hover:ring-2 hover:ring-violet-500 transition focus:outline-none focus:ring-2 focus:ring-violet-500"
    >
      {isVideo ? (
        // For video we don't auto-load every cell — too heavy. Show a
        // poster-like placeholder; the lightbox loads the real <video>.
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-rose-100 to-rose-200">
          <span className="text-rose-700 font-mono text-xs">▶ VIDEO</span>
        </div>
      ) : (
        <img
          src={item.result_url}
          alt={item.prompt.slice(0, 60)}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition">
        <p className="text-xs text-white truncate">{item.prompt}</p>
      </div>
    </button>
  );
}

function PreviewModal({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-4xl w-full bg-white rounded-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{item.prompt}</p>
            <p className="text-xs text-slate-500 truncate">
              {item.job_type} · {item.profile_name ?? "—"} · {item.user_email ?? "—"} ·{" "}
              {new Date(item.created_at).toLocaleString("vi-VN")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex-shrink-0 ml-3"
          >
            <X size={20} />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-50">
          {item.job_type === "video" ? (
            <video
              src={item.result_url}
              controls
              autoPlay
              className="max-w-full max-h-[70vh] rounded"
            />
          ) : (
            <img
              src={item.result_url}
              alt={item.prompt}
              className="max-w-full max-h-[70vh] object-contain"
            />
          )}
        </div>
        <footer className="px-4 py-2 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
          <code className="font-mono">{item.job_id.slice(0, 8)}</code>
          <a
            href={item.result_url}
            target="_blank"
            rel="noreferrer"
            className="text-violet-600 hover:underline"
          >
            Mở trong tab mới
          </a>
        </footer>
      </div>
    </div>
  );
}
