/** Tool registry — single source of truth for what each Flow tool does,
 *  how many files it takes, and what form fields to render.
 *
 *  Adding a new tool? Append an entry here + the matching upstream FastAPI
 *  endpoint (`/api/v1/video/<slug>`). The reusable VideoToolPage picks the
 *  rest up automatically — no per-tool React file needed.
 */
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

export interface ToolDef {
  slug: string;                  // URL slug = upstream endpoint name
  label: string;
  icon: LucideIcon;
  description: string;
  /** Min/Max input files accepted. */
  inputFiles: { min: number; max: number; accept: string };
  /** Form fields rendered after the file picker. */
  fields: ToolField[];
}

export const TOOLS: ToolDef[] = [
  {
    slug: "cut",
    label: "Cắt video",
    icon: Scissors,
    description: "Cắt một đoạn từ video gốc theo mốc thời gian.",
    inputFiles: { min: 1, max: 1, accept: "video/*" },
    fields: [
      {
        name: "start_time",
        label: "Bắt đầu (HH:MM:SS)",
        kind: "text",
        placeholder: "00:00:10",
        default: "00:00:00",
        required: true,
      },
      {
        name: "end_time",
        label: "Kết thúc (HH:MM:SS)",
        kind: "text",
        placeholder: "00:00:30",
        default: "00:00:10",
        required: true,
      },
    ],
  },
  {
    slug: "merge",
    label: "Ghép video",
    icon: Combine,
    description: "Nối nhiều file video thành một (codec phải khớp).",
    inputFiles: { min: 2, max: 10, accept: "video/*" },
    fields: [],
  },
  {
    slug: "extract-audio",
    label: "Tách âm thanh",
    icon: AudioLines,
    description: "Trích xuất audio track từ video sang MP3/WAV/AAC.",
    inputFiles: { min: 1, max: 1, accept: "video/*" },
    fields: [
      {
        name: "format",
        label: "Định dạng audio",
        kind: "text",
        default: "mp3",
        placeholder: "mp3 | wav | aac",
      },
    ],
  },
  {
    slug: "add-audio",
    label: "Ghép / thay audio",
    icon: Replace,
    description:
      "File 1 = video gốc, file 2 = audio mới. Bật 'replace' để thay toàn bộ audio gốc.",
    inputFiles: { min: 2, max: 2, accept: "audio/*,video/*" },
    fields: [
      {
        name: "replace",
        label: "Thay thế audio gốc",
        kind: "boolean",
        default: false,
        help: "Tắt = giữ audio gốc và mix thêm. Bật = thay sạch.",
      },
    ],
  },
  {
    slug: "speed",
    label: "Thay đổi tốc độ",
    icon: Gauge,
    description: "Tăng/giảm playback speed. 0.5 = chậm 2×; 2.0 = nhanh 2×.",
    inputFiles: { min: 1, max: 1, accept: "video/*" },
    fields: [
      {
        name: "speed",
        label: "Tốc độ",
        kind: "number",
        default: 1.0,
        step: 0.1,
        min: 0.25,
        max: 4,
        required: true,
      },
      {
        name: "adjust_audio",
        label: "Điều chỉnh audio theo tốc độ",
        kind: "boolean",
        default: true,
      },
    ],
  },
  {
    slug: "resize",
    label: "Resize",
    icon: Maximize2,
    description: "Đổi kích thước video. Giữ aspect ratio mặc định.",
    inputFiles: { min: 1, max: 1, accept: "video/*" },
    fields: [
      { name: "width", label: "Chiều rộng (px)", kind: "number", default: 1280, required: true },
      { name: "height", label: "Chiều cao (px)", kind: "number", default: 720, required: true },
      {
        name: "maintain_aspect",
        label: "Giữ aspect ratio",
        kind: "boolean",
        default: true,
      },
    ],
  },
  {
    slug: "crop",
    label: "Crop",
    icon: Crop,
    description: "Cắt vùng hiển thị theo toạ độ (x, y) và kích thước (w, h).",
    inputFiles: { min: 1, max: 1, accept: "video/*" },
    fields: [
      { name: "width", label: "Width", kind: "number", default: 640, required: true },
      { name: "height", label: "Height", kind: "number", default: 360, required: true },
      { name: "x", label: "Offset X", kind: "number", default: 0 },
      { name: "y", label: "Offset Y", kind: "number", default: 0 },
    ],
  },
  {
    slug: "extract-frames",
    label: "Trích xuất frame",
    icon: Film,
    description:
      "Lưu khung hình về dạng PNG. Bật 'first_frame'/'last_frame' hoặc nhập 'timestamp' (giây).",
    inputFiles: { min: 1, max: 1, accept: "video/*" },
    fields: [
      { name: "first_frame", label: "Frame đầu", kind: "boolean", default: true },
      { name: "last_frame", label: "Frame cuối", kind: "boolean", default: false },
      {
        name: "timestamp",
        label: "Hoặc tại giây thứ…",
        kind: "number",
        placeholder: "ví dụ 3.5",
        step: 0.1,
      },
    ],
  },
];

export const TOOL_BY_SLUG: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.slug, t]),
);
