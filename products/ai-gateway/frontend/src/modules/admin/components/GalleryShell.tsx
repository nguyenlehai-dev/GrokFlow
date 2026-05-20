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
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Image as ImageIcon, ChevronLeft, ChevronRight,
  Sparkles, Film, MessageSquare,
} from "lucide-react";

import { useAuthStore } from "@/core/auth/store";
import type { GalleryItem, GalleryDomainOption as DomainOption } from "../models/gallery";
import { galleryService } from "../services/gallery.service";
import { domainsService } from "../services/domains.service";
import { GalleryFilterBar } from "./GalleryFilterBar";
import { GalleryMediaGrid } from "./GalleryMediaGrid";
import { GalleryPromptList } from "./GalleryPromptList";
import { GalleryPreviewModal } from "./GalleryPreviewModal";

export type GalleryMode = "images" | "videos" | "prompts";

// Smaller page = faster TTI. 18 items = 3 rows × 6 cols on desktop, still
// "one screen" of preview without making the user paginate too often.
const PAGE_SIZE = 18;

const MODE_META: Record<GalleryMode, {
  titleKey: string;
  subtitleKey: string;
  icon: any;
  jobType: "image" | "video" | "";
  accent: string;
}> = {
  images: {
    titleKey: "admin.gallery_images_title",
    subtitleKey: "admin.gallery_images_subtitle",
    icon: ImageIcon,
    jobType: "image",
    accent: "from-violet-600 via-fuchsia-600 to-rose-500",
  },
  videos: {
    titleKey: "admin.gallery_videos_title",
    subtitleKey: "admin.gallery_videos_subtitle",
    icon: Film,
    jobType: "video",
    accent: "from-fuchsia-600 via-rose-500 to-amber-500",
  },
  prompts: {
    titleKey: "admin.gallery_prompts_title",
    subtitleKey: "admin.gallery_prompts_subtitle",
    icon: MessageSquare,
    jobType: "",
    accent: "from-indigo-600 via-violet-600 to-fuchsia-600",
  },
};

export function GalleryShell({ mode }: { mode: GalleryMode }) {
  const { t } = useTranslation();
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
    queryFn: () => domainsService.listAs<DomainOption>(),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["gallery", mode, search, domainId, offset],
    queryFn: () => {
      const params: Record<string, string | number> = {
        offset,
        limit: PAGE_SIZE,
      };
      if (meta.jobType) params.job_type = meta.jobType;
      if (search.trim()) params.q = search.trim();
      if (domainId) params.domain_id = domainId;
      return galleryService.list(params);
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
              {isSuper ? t("admin.gallery_super_kicker") : t("admin.gallery_kicker")}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold mt-0.5 flex items-center gap-2 tracking-tight">
              <meta.icon size={26} /> {t(meta.titleKey)}
            </h1>
            <p className="text-sm opacity-90 mt-1.5">{t(meta.subtitleKey)}</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-white/15 backdrop-blur-sm px-4 py-1.5 font-mono text-sm">
            <Sparkles size={14} /> {t("admin.gallery_results_count", { value: total.toLocaleString() })}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <GalleryFilterBar
        mode={mode}
        search={search}
        onSearchChange={setSearch}
        isSuper={isSuper}
        domainId={domainId}
        onDomainChange={setDomainId}
        domains={domains ?? []}
      />

      {/* Body */}
      {isLoading && !data ? (
        mode === "prompts" ? <PromptSkeleton /> : <GridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState hasData={total > 0} mode={mode} />
      ) : mode === "prompts" ? (
        <GalleryPromptList items={items} onPreview={setPreview} isSuper={isSuper} />
      ) : (
        <GalleryMediaGrid items={items} onPreview={setPreview} />
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between flex-wrap gap-3 text-sm text-slate-300 pt-2">
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
              <ChevronLeft className="h-4 w-4" /> {t("admin.gallery_prev")}
            </button>
            <span className="px-3 text-sm font-semibold">
              {t("admin.gallery_page_indicator", { current: currentPage, total: totalPages })}
            </span>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() =>
                setOffset(Math.min((totalPages - 1) * PAGE_SIZE, offset + PAGE_SIZE))
              }
              disabled={currentPage >= totalPages}
            >
              {t("admin.gallery_next")} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {preview && <GalleryPreviewModal item={preview} onClose={() => setPreview(null)} />}
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
  const { t } = useTranslation();
  const Icon = MODE_META[mode].icon;
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 px-6 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-brand-50 flex items-center justify-center">
        <Icon size={24} className="text-blue-600" />
      </div>
      <h3 className="mt-3 font-semibold text-slate-800">
        {hasData ? t("admin.gallery_empty_filtered") : t("admin.gallery_empty_initial")}
      </h3>
      <p className="mt-1 text-sm text-slate-400">
        {hasData
          ? t("admin.gallery_empty_filtered_desc")
          : t("admin.gallery_empty_initial_desc")}
      </p>
    </div>
  );
}
