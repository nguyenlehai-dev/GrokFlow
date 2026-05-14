/**
 * Shared gallery shell — three modes via `mode` prop:
 *   images   — grid of generated images
 *   videos   — grid of generated videos
 *   prompts  — text-focused list of every prompt + small result thumbnail
 *
 * Super-admin sees all rows and can filter by tenant domain; admin sees
 * only their domain; user sees own jobs. Filtering logic lives on the
 * backend so this component just renders what /api/gallery returns.
 */
import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Image as ImageIcon, Video as VideoIcon, Search, ChevronLeft, ChevronRight,
  X, Download, ExternalLink, Calendar, User as UserIcon, Layers,
  Sparkles, Film, Wand2, Globe, MessageSquare, Copy, Check,
} from "lucide-react";

import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";

interface GalleryItem {
  job_id: string;
  job_type: "image" | "video";
  provider: string;
  prompt: string;
  result_url: string;
  profile_name: string | null;
  user_email: string | null;
  domain_id: string | null;
  domain_hostname: string | null;
  domain_brand_name: string | null;
  created_at: string;
  completed_at: string | null;
}

interface GalleryPageOut {
  items: GalleryItem[];
  total: number;
  offset: number;
  limit: number;
}

interface DomainOption {
  id: string;
  hostname: string;
  brand_name: string | null;
}

export type GalleryMode = "images" | "videos" | "prompts";

// Smaller page = faster TTI. 18 items = 3 rows × 6 cols on desktop, still
// "one screen" of preview without making the user paginate too often.
const PAGE_SIZE = 18;

/** Render `<img>` / `<video>` only once the element enters the viewport.
 *  Even though browsers honor `loading="lazy"` on <img>, the lazy heuristic
 *  is generous — it eagerly fetches anything within ~3 screens of the
 *  viewport, which is still 50+ thumbnails on a long gallery. Wrapping
 *  with IntersectionObserver gives us a fixed `rootMargin` so we only
 *  pay for what's actually about to be seen. */
function useInView<T extends HTMLElement>(rootMargin = "200px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!ref.current || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return { ref, inView };
}

const MODE_META: Record<GalleryMode, {
  title: string;
  subtitle: string;
  icon: any;
  jobType: "image" | "video" | "";
  accent: string;
}> = {
  images: {
    title: "Thư viện ảnh",
    subtitle: "Mọi ảnh AI đã render bởi Grok — sắp xếp theo thời gian",
    icon: ImageIcon,
    jobType: "image",
    accent: "from-violet-600 via-fuchsia-600 to-rose-500",
  },
  videos: {
    title: "Thư viện video",
    subtitle: "Mọi video đã render — preview thumbnail + watch full",
    icon: Film,
    jobType: "video",
    accent: "from-fuchsia-600 via-rose-500 to-amber-500",
  },
  prompts: {
    title: "Thư viện prompts",
    subtitle: "Mọi prompt đã chạy — copy nhanh, xem kết quả kèm theo",
    icon: MessageSquare,
    jobType: "",
    accent: "from-indigo-600 via-violet-600 to-fuchsia-600",
  },
};

export function GalleryShell({ mode }: { mode: GalleryMode }) {
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";
  const meta = MODE_META[mode];

  const [search, setSearch] = useState("");
  const [domainId, setDomainId] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [preview, setPreview] = useState<GalleryItem | null>(null);

  // Reset pagination when filters change.
  useEffect(() => { setOffset(0); }, [mode, search, domainId]);

  // Domain list — only fetched for super_admin (the only role that can
  // filter cross-domain). Cached forever since it changes rarely.
  const { data: domains } = useQuery({
    queryKey: ["admin-domains"],
    enabled: isSuper,
    queryFn: async () =>
      (await api.get<DomainOption[]>("/api/admin/domains")).data,
    staleTime: 5 * 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["gallery", mode, search, domainId, offset],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        offset,
        limit: PAGE_SIZE,
      };
      if (meta.jobType) params.job_type = meta.jobType;
      if (search.trim()) params.q = search.trim();
      if (domainId) params.domain_id = domainId;
      return (
        await api.get<GalleryPageOut>("/api/gallery", { params })
      ).data;
    },
    staleTime: 15_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className={`rounded-2xl bg-gradient-to-br ${meta.accent} text-white p-6 shadow-card-hover`}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider opacity-80 font-semibold">
              {isSuper ? "Super admin · Gallery" : "Gallery"}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold mt-0.5 flex items-center gap-2 tracking-tight">
              <meta.icon size={26} /> {meta.title}
            </h1>
            <p className="text-sm opacity-90 mt-1.5">{meta.subtitle}</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-white/15 backdrop-blur-sm px-4 py-1.5 font-mono text-sm">
            <Sparkles size={14} /> {total.toLocaleString()} kết quả
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card flex flex-wrap items-center gap-2.5 py-3.5">
        <div className="flex items-center bg-ink-50 rounded-lg px-3 w-full sm:w-auto sm:flex-1 min-w-[220px] focus-within:ring-2 focus-within:ring-brand-200">
          <Search className="h-4 w-4 text-ink-400 shrink-0" />
          <input
            className="w-full bg-transparent px-2 py-2 text-sm outline-none"
            placeholder={
              mode === "prompts"
                ? "Tìm trong nội dung prompt..."
                : "Tìm theo prompt, profile..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-ink-400 hover:text-ink-700"
              title="Xóa"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {isSuper && (
          <div className="flex items-center gap-1.5">
            <Globe size={14} className="text-ink-500" />
            <select
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              className="input input-sm w-auto"
              title="Lọc theo tenant domain"
            >
              <option value="">Mọi domain</option>
              {(domains ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.brand_name || d.hostname} · @{d.hostname}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Body */}
      {isLoading && !data ? (
        mode === "prompts" ? <PromptSkeleton /> : <GridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState hasData={total > 0} mode={mode} />
      ) : mode === "prompts" ? (
        <PromptList items={items} onPreview={setPreview} isSuper={isSuper} />
      ) : (
        <MediaGrid items={items} onPreview={setPreview} />
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between flex-wrap gap-3 text-sm text-ink-600 pt-2">
          <span>
            {(offset + 1).toLocaleString()}–
            {Math.min(offset + PAGE_SIZE, total).toLocaleString()} /{" "}
            {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" /> Trước
            </button>
            <span className="px-3 text-sm font-semibold">
              Trang {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() =>
                setOffset(Math.min((totalPages - 1) * PAGE_SIZE, offset + PAGE_SIZE))
              }
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

// ─── Grid layout (images / videos) ──────────────────────────────────────────

function MediaGrid({
  items, onPreview,
}: { items: GalleryItem[]; onPreview: (i: GalleryItem) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {items.map((item) => (
        <GalleryCell key={item.job_id} item={item} onClick={() => onPreview(item)} />
      ))}
    </div>
  );
}

function GalleryCell({ item, onClick }: { item: GalleryItem; onClick: () => void }) {
  const isVideo = item.job_type === "video";
  const { ref, inView } = useInView<HTMLButtonElement>("400px");
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="group relative rounded-xl overflow-hidden bg-ink-100 aspect-square ring-1 ring-ink-200 hover:ring-2 hover:ring-brand-400 hover:shadow-card-hover transition focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      {!inView ? (
        // Cheap placeholder until the cell is near the viewport. Keeps
        // off-screen rows from spawning N HTTP requests on mount.
        <div className="absolute inset-0 bg-gradient-to-br from-ink-100 to-ink-200" />
      ) : isVideo ? (
        <VideoThumb url={item.result_url} />
      ) : (
        <img
          src={item.result_url}
          alt={item.prompt.slice(0, 60)}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = "0.2";
          }}
        />
      )}
      <span
        className={`absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${
          isVideo ? "bg-accent-fuchsia/90 text-white" : "bg-brand-600/90 text-white"
        }`}
      >
        {isVideo ? <Film size={9} /> : <ImageIcon size={9} />}
        {isVideo ? "VIDEO" : "ẢNH"}
      </span>
      {item.domain_hostname && (
        <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-medium backdrop-blur-sm bg-black/50 text-white">
          <Globe size={8} /> {item.domain_brand_name || item.domain_hostname}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 opacity-0 group-hover:opacity-100 transition pointer-events-none">
        <p className="text-xs text-white line-clamp-2 leading-tight">{item.prompt}</p>
        {item.user_email && (
          <p className="text-[10px] text-white/80 mt-1 font-mono truncate">{item.user_email}</p>
        )}
      </div>
    </button>
  );
}

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

// ─── Prompts list layout ────────────────────────────────────────────────────

function PromptList({
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
        className="relative shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-ink-100 ring-1 ring-ink-200 hover:ring-2 hover:ring-brand-400 transition"
      >
        {!inView ? (
          <div className="absolute inset-0 bg-gradient-to-br from-ink-100 to-ink-200" />
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
        <p className="text-sm text-ink-900 leading-snug">{item.prompt || <i className="text-ink-400">(không có prompt)</i>}</p>
        <div className="flex items-center gap-2.5 mt-2 text-xs text-ink-500 flex-wrap">
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

// ─── Skeletons + empty ──────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square rounded-xl skeleton"
          style={{ animationDelay: `${i * 50}ms` }}
        />
      ))}
    </div>
  );
}

function PromptSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card flex gap-4 p-4">
          <div className="w-24 h-24 rounded-lg skeleton" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 skeleton" />
            <div className="h-3 w-1/2 skeleton" />
            <div className="h-3 w-1/3 skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasData, mode }: { hasData: boolean; mode: GalleryMode }) {
  const Icon = MODE_META[mode].icon;
  return (
    <div className="rounded-2xl border-2 border-dashed border-ink-200 bg-white py-16 px-6 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-brand-50 flex items-center justify-center">
        <Icon size={24} className="text-brand-500" />
      </div>
      <h3 className="mt-3 font-semibold text-ink-800">
        {hasData ? "Không có item nào khớp filter" : "Chưa có gì ở đây"}
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        {hasData
          ? "Thử bỏ filter hoặc đổi từ khóa tìm kiếm."
          : "Khi user submit job và Grok render xong, kết quả sẽ tự xuất hiện."}
      </p>
    </div>
  );
}

// ─── Preview modal ──────────────────────────────────────────────────────────

function PreviewModal({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/90 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="max-w-5xl w-full bg-white rounded-2xl overflow-hidden flex flex-col max-h-[92vh] shadow-card-hover animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-ink-100 bg-ink-50">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink-900 truncate">
              {item.prompt || "(không có prompt)"}
            </p>
            <div className="flex items-center gap-3 mt-1 text-xs text-ink-500 flex-wrap">
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
            className="rounded-lg p-2 text-ink-400 hover:bg-ink-200 hover:text-ink-700 flex-shrink-0 ml-3"
            title="Đóng (Esc)"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-gradient-to-br from-ink-100 to-ink-200 flex items-center justify-center p-6">
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

        <footer className="px-5 py-3 border-t border-ink-100 bg-white flex justify-between items-center text-xs">
          <code className="font-mono text-ink-500">{item.job_id.slice(0, 8)}</code>
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
