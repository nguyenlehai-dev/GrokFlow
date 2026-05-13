/** Tool registry — single source of truth for what each Flow tool does,
 *  how many files it takes, what UI bits to render and what form fields
 *  to submit. The new dark-themed UI uses the extra metadata
 *  (`helperText`, `dropZoneLabel`, `dualInputs`, `acceptUrlInput`) to
 *  build per-tool workspaces without writing a new React page per tool.
 *
 *  Adding a new tool? Append an entry and (if needed) wire the matching
 *  endpoint on the GrokFlow backend proxy `/api/flow/run/<slug>`. */
import {
  Scissors,
  Combine,
  AudioLines,
  Replace,
  Gauge,
  Maximize2,
  Crop,
  Film,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type FieldKind = "text" | "number" | "boolean";

export interface ToolField {
  name: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  default?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  help?: string;
}

/** A drop-zone slot — single tool may have one (most) or two (add-audio). */
export interface DropZone {
  label: string;        // headline shown inside the box
  hint?: string;        // small line below the headline
  icon: "video" | "audio" | "media"; // which circular glyph to show
  accept: string;       // MIME filter
  multiple: boolean;    // multi-file picker (merge only)
}

export interface ToolDef {
  slug: string;             // URL slug = upstream endpoint name
  label: string;            // long label for sidebar
  shortLabel: string;       // short label for Toolbox sidebar
  tagline: string;          // one-line subtitle under shortLabel
  icon: LucideIcon;
  helperText: string;       // shown inside the OPERATION SYNTAX block
  inputs: {
    /** Min/max for the *primary* drop zone (single-zone tools). */
    min: number;
    max: number;
    /** Primary drop zone metadata. */
    primary: DropZone;
    /** Add-audio (and any future 2-input tool) uses a second zone. */
    secondary?: DropZone;
    /** Show the "Paste an existing R2/Cloudflare URL" fallback? Default true. */
    acceptUrlInput?: boolean;
  };
  /** Form fields rendered inside the Operation Syntax card. */
  fields: ToolField[];
}

export const TOOLS: ToolDef[] = [
  {
    slug: "cut",
    label: "Cắt video",
    shortLabel: "Cut Video",
    tagline: "Trim video between timestamps",
    icon: Scissors,
    helperText:
      "Cắt một đoạn từ video gốc theo cặp timestamp HH:MM:SS. Mọi giá trị > tổng thời lượng sẽ bị FFmpeg cắt về cuối.",
    inputs: {
      min: 1,
      max: 1,
      primary: { label: "Drop video here", hint: "or click to browse local files", icon: "video", accept: "video/*", multiple: false },
      acceptUrlInput: true,
    },
    fields: [
      { name: "start_time", label: "Start Timestamp (HH:MM:SS)", kind: "text", default: "00:00:00", placeholder: "00:00:00", required: true },
      { name: "end_time", label: "End Timestamp (HH:MM:SS)", kind: "text", default: "00:00:10", placeholder: "00:00:10", required: true },
    ],
  },
  {
    slug: "merge",
    label: "Ghép video",
    shortLabel: "Merge Videos",
    tagline: "Basic concat multiple videos",
    icon: Combine,
    helperText:
      "The output canvas resolution and framerate will intelligently match the first video dropped.",
    inputs: {
      min: 2,
      max: 10,
      primary: { label: "Drop media files here", hint: "Select multiple files. First file dictates timeline resolution.", icon: "media", accept: "video/*", multiple: true },
      acceptUrlInput: false,
    },
    fields: [],
  },
  {
    slug: "extract-audio",
    label: "Tách âm thanh",
    shortLabel: "Extract Audio",
    tagline: "Get MP3 audio from video",
    icon: AudioLines,
    helperText:
      "No extra parameters needed. Intelligent detection will extract the best native audio track.",
    inputs: {
      min: 1,
      max: 1,
      primary: { label: "Drop video here", hint: "or click to browse local files", icon: "video", accept: "video/*", multiple: false },
      acceptUrlInput: true,
    },
    // Format defaults to mp3 on the BE; advanced override possible via API.
    fields: [],
  },
  {
    slug: "add-audio",
    label: "Ghép / thay audio",
    shortLabel: "Merge/Replace Audio",
    tagline: "Add or replace audio track",
    icon: Replace,
    helperText:
      "File 1 = video gốc, file 2 = audio mới. Bật 'Replace native audio track' để thay sạch audio gốc — tắt để mix thêm.",
    inputs: {
      min: 2,
      max: 2,
      primary: { label: "Drop video here", hint: "or click to browse local files", icon: "video", accept: "video/*", multiple: false },
      secondary: { label: "Drop audio here", hint: "or click to browse local files", icon: "audio", accept: "audio/*", multiple: false },
      acceptUrlInput: true,
    },
    fields: [
      { name: "replace", label: "Replace native audio track", kind: "boolean", default: false, help: "Default mixes both tracks" },
    ],
  },
  {
    slug: "speed",
    label: "Đổi tốc độ",
    shortLabel: "Change Speed",
    tagline: "Speed up or slow down",
    icon: Gauge,
    helperText:
      "Tăng/giảm playback speed. 0.5 = chậm 2×; 2.0 = nhanh 2×. Audio cũng được điều chỉnh theo.",
    inputs: {
      min: 1,
      max: 1,
      primary: { label: "Drop video here", hint: "or click to browse local files", icon: "video", accept: "video/*", multiple: false },
      acceptUrlInput: true,
    },
    fields: [
      { name: "speed", label: "Speed Factor (0.25 to 4.0)", kind: "number", default: 1.5, step: 0.1, min: 0.25, max: 4, required: true },
    ],
  },
  {
    slug: "resize",
    label: "Resize",
    shortLabel: "Resize",
    tagline: "Change video resolution",
    icon: Maximize2,
    helperText:
      "Đổi kích thước video. Giữ aspect ratio và pad nếu lệch tỷ lệ.",
    inputs: {
      min: 1,
      max: 1,
      primary: { label: "Drop video here", hint: "or click to browse local files", icon: "video", accept: "video/*", multiple: false },
      acceptUrlInput: true,
    },
    fields: [
      { name: "width", label: "Output Width (px)", kind: "number", default: 1280, required: true },
      { name: "height", label: "Output Height (px)", kind: "number", default: 720, required: true },
    ],
  },
  {
    slug: "crop",
    label: "Crop",
    shortLabel: "Crop Video",
    tagline: "Crop video dimensions",
    icon: Crop,
    helperText:
      "Cắt vùng hiển thị theo gốc trái (x, y) và kích thước (width, height) pixel.",
    inputs: {
      min: 1,
      max: 1,
      primary: { label: "Drop video here", hint: "or click to browse local files", icon: "video", accept: "video/*", multiple: false },
      acceptUrlInput: true,
    },
    fields: [
      { name: "width", label: "Crop Width (px)", kind: "number", default: 640, required: true },
      { name: "height", label: "Crop Height (px)", kind: "number", default: 640, required: true },
      { name: "x", label: "Offset X (px)", kind: "number", default: 0 },
      { name: "y", label: "Offset Y (px)", kind: "number", default: 0 },
    ],
  },
  {
    slug: "extract-frames",
    label: "Trích xuất frame",
    shortLabel: "Extract Frames",
    tagline: "Get frames at specific times",
    icon: Film,
    helperText:
      "Trích xuất khung hình về PNG. Bật 'Extract Initial Frame' / 'Extract Final Frame' hoặc nhập 'timestamp' (giây) — timestamp ưu tiên hơn.",
    inputs: {
      min: 1,
      max: 1,
      primary: { label: "Drop video here", hint: "or click to browse local files", icon: "video", accept: "video/*", multiple: false },
      acceptUrlInput: true,
    },
    fields: [
      { name: "first_frame", label: "Extract Initial Frame", kind: "boolean", default: false },
      { name: "last_frame", label: "Extract Final Frame", kind: "boolean", default: false },
      { name: "timestamp", label: "Extract Specific Timestamp (seconds, e.g. 5.5)", kind: "number", placeholder: "Empty drops this feature", step: 0.1 },
    ],
  },
];

export const TOOL_BY_SLUG: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.slug, t]),
);
