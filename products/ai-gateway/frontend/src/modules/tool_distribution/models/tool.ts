/** Tool distribution types — mirror of backend `Tool` / `ToolAsset`. */

export type AssetKind = "win" | "mac" | "document";

export interface ToolAsset {
  id: string;
  tool_id: string;
  kind: AssetKind;
  label: string;
  version: string | null;
  file_id: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  is_latest: boolean;
  notes: string | null;
  download_count: number;
  sort_order: number;
  /** Admin-only stream endpoint — must be fetched via axios so the JWT
   *  is attached. Hand it to `downloadAuthed()` to trigger a download. */
  download_url: string;
}

export interface Tool {
  id: string;
  code: string;
  name: string;
  description: string | null;
  logo_file_id: string | null;
  logo_url: string | null;
  homepage_url: string | null;
  sort_order: number;
  assets: ToolAsset[];
}

export interface ToolCreate {
  code: string;
  name: string;
  description?: string | null;
  homepage_url?: string | null;
}

export interface ToolUpdate {
  name?: string;
  description?: string | null;
  homepage_url?: string | null;
  sort_order?: number;
}

export interface ToolAssetUpdate {
  label?: string;
  version?: string | null;
  notes?: string | null;
  is_latest?: boolean;
  sort_order?: number;
}

/** Human label + tone for each asset kind, used by the page header and
 *  empty-state copy. Centralised so the 3 routes share the same lexicon. */
export const KIND_META: Record<AssetKind, {
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  accent: string;
}> = {
  win: {
    label: "Windows",
    shortLabel: "win",
    description: "Bộ cài đặt cho Windows (.exe / .msi). Upload bản mới + đánh dấu Latest.",
    icon: "🪟",
    accent: "cyan",
  },
  mac: {
    label: "macOS",
    shortLabel: "mac",
    description: "Bộ cài đặt cho Mac (.dmg / .pkg). Mỗi tool có thể có nhiều bản, đánh dấu Latest.",
    icon: "",
    accent: "slate",
  },
  document: {
    label: "Document",
    shortLabel: "document",
    description: "Tài liệu hướng dẫn / changelog (PDF, ảnh, MD). Khách hàng tải về để đọc.",
    icon: "📄",
    accent: "amber",
  },
};
