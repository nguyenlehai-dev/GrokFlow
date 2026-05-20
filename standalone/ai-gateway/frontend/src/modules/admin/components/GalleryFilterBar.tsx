import { Search, X, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GalleryDomainOption as DomainOption } from "../models/gallery";
import type { GalleryMode } from "./GalleryShell";

export function GalleryFilterBar({
  mode, search, onSearchChange, isSuper, domainId, onDomainChange, domains,
}: {
  mode: GalleryMode;
  search: string;
  onSearchChange: (v: string) => void;
  isSuper: boolean;
  domainId: string;
  onDomainChange: (v: string) => void;
  domains: DomainOption[];
}) {
  const { t } = useTranslation();
  return (
    <div className="card flex flex-wrap items-center gap-2.5 py-3.5">
      <div className="flex items-center bg-slate-100 rounded-lg px-3 w-full sm:w-auto sm:flex-1 min-w-[220px] focus-within:ring-2 focus-within:ring-blue-200">
        <Search className="h-4 w-4 text-slate-500 shrink-0" />
        <input
          className="w-full bg-transparent px-2 py-2 text-sm outline-none"
          placeholder={
            mode === "prompts"
              ? t("admin.gallery_search_ph_prompts")
              : t("admin.gallery_search_ph_media")
          }
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            className="text-slate-500 hover:text-slate-700"
            title={t("admin.gallery_clear")}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isSuper && (
        <div className="flex items-center gap-1.5">
          <Globe size={14} className="text-slate-400" />
          <select
            value={domainId}
            onChange={(e) => onDomainChange(e.target.value)}
            className="input input-sm w-auto"
            title={t("admin.gallery_filter_domain_title")}
          >
            <option value="">{t("admin.gallery_all_domains")}</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.brand_name || d.hostname} · @{d.hostname}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
