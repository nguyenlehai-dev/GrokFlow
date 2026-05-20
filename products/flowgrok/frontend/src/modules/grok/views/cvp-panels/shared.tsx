// Reusable building blocks for every Create Video Pro panel.
//
// Each panel composes these primitives to keep the page-level chrome
// (toolbar / settings / batch / folder / progress / log) consistent
// without duplicating ~400 LOC of layout per tool.

import { useState } from "react";
import {
  Play, Loader2, CheckCircle2, XCircle, FolderOpen, FolderSearch,
  Zap, Clock, Sparkles, Hash, Aperture, Aperture as Lens,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";

export type RowStatus = "pending" | "running" | "success" | "failed";

export interface BasePromptRow {
  id: number;
  text: string;
  status: RowStatus;
  result_url?: string;
}

export interface LogEntry {
  ts: string;
  level: "info" | "success" | "warn" | "error";
  msg: string;
}

export function nowTs(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ─── ToolButton ────────────────────────────────────────────────────────────

export function ToolButton({
  icon: Icon, children, variant = "default", onClick, disabled,
}: {
  icon: typeof Play;
  children: React.ReactNode;
  variant?: "default" | "primary" | "danger" | "teal";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const cls = {
    default: "cvp-btn-ghost",
    primary: "cvp-btn-primary",
    danger:  "cvp-btn-danger",
    teal:    "cvp-btn-teal",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${cls} inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <Icon size={12} /> {children}
    </button>
  );
}

// ─── Status pill ───────────────────────────────────────────────────────────

export function StatusPill({ status }: { status: RowStatus }) {
  const map = {
    pending: { cls: "cvp-pill-idle",    icon: Loader2,       label: "Chờ" },
    running: { cls: "cvp-pill-running", icon: null,          label: "Đang chạy" },
    success: { cls: "cvp-pill-success", icon: CheckCircle2,  label: "Hoàn thành" },
    failed:  { cls: "cvp-pill-danger",  icon: XCircle,       label: "Thất bại" },
  } as const;
  const info = map[status];
  const Icon = info.icon;
  return (
    <span className={`cvp-pill ${info.cls}`}>
      {Icon && <Icon size={10} className={status === "pending" ? "animate-spin" : ""} />}
      {info.label}
    </span>
  );
}

// ─── Setting cell (icon + label + value) ──────────────────────────────────

export function SettingCell({
  icon: Icon, label, children,
}: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold inline-flex items-center gap-1">
        <Icon size={9} /> {label}
      </div>
      {children}
    </div>
  );
}

// ─── Settings row ─────────────────────────────────────────────────────────
//
// Default settings shared by every "generate video" panel. Each panel can
// pass a custom slot for tool-specific knobs (e.g. video panels show
// duration, image panels show quality instead).

// Values map directly to what backend Grok provider sets on Grok's UI.
// Verified against backend/app/providers/grok_provider.py:
//   - aspect_ratio: 1:1 / 16:9 / 9:16 / 3:2 / 2:3 / 4:3 / 3:4 (Grok's
//     Aspect Ratio popover only lists these labels)
//   - duration: 6 or 10 seconds ONLY (radios are exactly "6s" / "10s")
//   - resolution: 480p / 720p ONLY
// Sending anything outside these silently falls back to provider default,
// confusing the user who picked e.g. "9s" and got 10s.
export function VideoSettingsRow({
  ratio, setRatio, duration, setDuration, resolution, setResolution, count, setCount,
}: {
  ratio: string; setRatio: (v: string) => void;
  duration: string; setDuration: (v: string) => void;
  resolution: string; setResolution: (v: string) => void;
  count: string; setCount: (v: string) => void;
}) {
  return (
    <div className="cvp-card p-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <SettingCell icon={Lens} label="Tỷ lệ">
          <select value={ratio} onChange={(e) => setRatio(e.target.value)} className="cvp-input w-full">
            <option value="3:2">3:2 (Grok default)</option>
            <option value="16:9">16:9 (Landscape)</option>
            <option value="9:16">9:16 (Portrait)</option>
            <option value="1:1">1:1 (Square)</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
            <option value="2:3">2:3</option>
          </select>
        </SettingCell>
        <SettingCell icon={Clock} label="Độ dài">
          <select value={duration} onChange={(e) => setDuration(e.target.value)} className="cvp-input w-full">
            <option value="6">6 giây</option>
            <option value="10">10 giây</option>
          </select>
        </SettingCell>
        <SettingCell icon={Sparkles} label="Phân giải">
          <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="cvp-input w-full">
            <option value="480p">480p (SD)</option>
            <option value="720p">720p (HD)</option>
          </select>
        </SettingCell>
        <SettingCell icon={Hash} label="Số lượng">
          <input type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} className="cvp-input w-full" />
        </SettingCell>
      </div>
    </div>
  );
}

// Image-mode params, mapped to what Grok actually accepts on the prompt
// bar (verified against backend/app/providers/grok_provider.py:1224):
//   - quality: "Speed" / "Quality" radio (case-insensitive)
//   - aspect_ratio: same as video (1:1 / 16:9 / 9:16 / 3:2 / 4:3 / 3:4)
//   - style: a free-text hint we append to the prompt — Grok doesn't have
//     a "style" UI for images, so any string works
//   - n: number of variants (max 4 per JobCreate)
export function ImageSettingsRow({
  ratio, setRatio, quality, setQuality, count, setCount, style, setStyle,
}: {
  ratio: string; setRatio: (v: string) => void;
  quality: string; setQuality: (v: string) => void;
  count: string; setCount: (v: string) => void;
  style: string; setStyle: (v: string) => void;
}) {
  return (
    <div className="cvp-card p-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <SettingCell icon={Lens} label="Tỷ lệ">
          <select value={ratio} onChange={(e) => setRatio(e.target.value)} className="cvp-input w-full">
            <option value="1:1">1:1 (Square)</option>
            <option value="16:9">16:9 (Landscape)</option>
            <option value="9:16">9:16 (Portrait)</option>
            <option value="3:2">3:2</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
          </select>
        </SettingCell>
        <SettingCell icon={Sparkles} label="Chất lượng">
          <select value={quality} onChange={(e) => setQuality(e.target.value)} className="cvp-input w-full">
            <option value="speed">Speed (nhanh)</option>
            <option value="quality">Quality (đẹp)</option>
          </select>
        </SettingCell>
        <SettingCell icon={Aperture} label="Phong cách (hint trong prompt)">
          <select value={style} onChange={(e) => setStyle(e.target.value)} className="cvp-input w-full">
            <option value="natural">Tự nhiên</option>
            <option value="cinematic">Cinematic</option>
            <option value="anime">Anime</option>
            <option value="3d">3D Render</option>
            <option value="oil">Sơn dầu</option>
            <option value="watercolor">Tranh màu nước</option>
            <option value="photorealistic">Photorealistic</option>
          </select>
        </SettingCell>
        <SettingCell icon={Hash} label="Số lượng (n)">
          <input type="number" min={1} max={4} value={count} onChange={(e) => setCount(e.target.value)} className="cvp-input w-full" />
        </SettingCell>
      </div>
    </div>
  );
}

// ─── Batch mode panel ─────────────────────────────────────────────────────

/** Delay-batch panel. When idle (no active waiting countdown) renders a
 *  passive indicator — the barber-pole stripe ONLY animates while
 *  `waitState` says we're between batches. Without this gate the stripe
 *  ran forever even on a fresh page load. */
export function BatchPanel({
  enabled, setEnabled, size, setSize, delay, setDelay, waitState,
}: {
  enabled: boolean; setEnabled: (v: boolean) => void;
  size: string; setSize: (v: string) => void;
  delay: string; setDelay: (v: string) => void;
  /** Provide when a batch run is in flight; pass null/undefined when idle. */
  waitState?: {
    currentBatch: number;
    totalBatches: number;
    /** Seconds remaining in the inter-batch pause. 0 = batch is RUNNING. */
    secondsLeft: number;
  } | null;
}) {
  const isWaiting = !!waitState && waitState.secondsLeft > 0;
  return (
    <div className="cvp-card cvp-batch p-3">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-amber-300">
          <Zap size={12} /> DELAY BATCH MODE
        </div>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-amber-200/90 cursor-pointer">
          <input type="checkbox" className="accent-amber-500" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Bật Delay Mode
        </label>
        <div className="flex items-center gap-1.5 text-[11px] text-amber-200/80">
          Batch Size <input type="number" min={1} max={100} value={size} onChange={(e) => setSize(e.target.value)} className="cvp-input w-14" />
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-amber-200/80">
          Delay (giây) <input type="number" min={0} max={300} value={delay} onChange={(e) => setDelay(e.target.value)} className="cvp-input w-14" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        {!enabled ? (
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap">
            Đã tắt — submit không delay
          </span>
        ) : !waitState ? (
          <span className="text-[10px] uppercase tracking-wider text-emerald-300/80 font-semibold whitespace-nowrap inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Sẵn sàng — submit {size} job rồi chờ {delay}s mỗi đợt
          </span>
        ) : isWaiting ? (
          <>
            <span className="text-[10px] uppercase tracking-wider text-amber-300/80 font-semibold whitespace-nowrap">
              Batch {waitState!.currentBatch}/{waitState!.totalBatches} xong
            </span>
            <div className="flex-1 h-1.5 cvp-batch-progress" />
            <span className="cvp-timer whitespace-nowrap">
              Còn {String(waitState!.secondsLeft).padStart(2, "0")}s
            </span>
          </>
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-cyan-300/80 font-semibold whitespace-nowrap inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Batch {waitState!.currentBatch}/{waitState!.totalBatches} đang submit...
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Folder picker ────────────────────────────────────────────────────────

/** Folder display + "Mở thư mục" trigger.
 *
 *  Behaviour depends on the runtime:
 *    - Desktop (Electron): `grokflowDesktop.openFolder(path)` → shell.openPath
 *      opens the folder in Explorer/Finder/Files.
 *    - Browser (no Electron): copies the path to clipboard + toast hint
 *      since browsers can't actually pop the OS file explorer.
 *
 *  Editing the path text is intentionally disabled — videos always save
 *  into a per-tool subfolder managed by the desktop client; the user
 *  shouldn't free-type a path. To change the *root* folder we'd add a
 *  separate "Đổi thư mục gốc" flow via Electron dialog.showOpenDialog. */
type DesktopAPI = {
  openFolder?: (p: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  pickFolder?: (p: string) => Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }>;
};

export function FolderPicker({
  folder, onChange,
}: { folder: string; onChange?: (next: string) => void }) {
  const api = (window as unknown as { grokflowDesktop?: DesktopAPI }).grokflowDesktop;
  const handleOpen = async () => {
    if (api?.openFolder) {
      const res = await api.openFolder(folder);
      if (res.ok) {
        // Main may have fallen back to <Documents>/GrokFlow/<name>. Persist.
        if (res.path && res.path !== folder) onChange?.(res.path);
      } else {
        try { await navigator.clipboard.writeText(folder); } catch { /* */ }
        toast(`Không mở được folder: ${res.error ?? "unknown"}. Đã copy path.`, "error");
      }
    } else {
      try {
        await navigator.clipboard.writeText(folder);
        toast("Đã copy đường dẫn — mở File Explorer rồi paste vào", "success");
      } catch {
        toast("Không truy cập clipboard được", "error");
      }
    }
  };

  const handlePick = async () => {
    if (!api?.pickFolder) {
      toast("Chỉ chọn được thư mục trong bản desktop", "info");
      return;
    }
    const res = await api.pickFolder(folder);
    if (res.ok && res.path) {
      onChange?.(res.path);
      toast("Đã đổi thư mục lưu", "success");
    } else if (!res.cancelled && res.error) {
      toast(`Không chọn được: ${res.error}`, "error");
    }
  };

  const isDesktop = Boolean(api?.pickFolder);
  return (
    <div className="cvp-card p-2.5 flex items-center gap-2.5">
      <button
        onClick={handleOpen}
        className="cvp-btn-teal text-[10px] px-3 py-1.5 inline-flex items-center gap-1.5 whitespace-nowrap"
        title="Mở thư mục hiện tại trong File Explorer"
      >
        <FolderOpen size={11} /> Mở thư mục
      </button>
      {onChange && (
        <button
          onClick={handlePick}
          disabled={!isDesktop}
          className="cvp-btn-violet text-[10px] px-3 py-1.5 inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          title={isDesktop ? "Đổi thư mục lưu — mở hộp thoại chọn thư mục" : "Chỉ hoạt động trong bản desktop"}
        >
          <FolderSearch size={11} /> Chọn thư mục…
        </button>
      )}
      <div className="flex-1 text-[11px] font-mono px-3 py-1.5 bg-black/40 rounded-md ring-1 ring-cyan-500/15 truncate"
           title={folder}>
        <span className="text-cyan-300/60 mr-2">▸</span>
        <span className="text-slate-300">{folder}</span>
      </div>
    </div>
  );
}

// ─── Progress footer ──────────────────────────────────────────────────────

export function ProgressFooter({
  total, success, failed,
}: { total: number; success: number; failed: number }) {
  const progress = total ? Math.round((success / total) * 100) : 0;
  return (
    <div className="cvp-card p-3 flex items-center gap-3">
      <div className="flex-1 h-2.5 cvp-progress-track">
        <div className="cvp-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="text-[11px] font-mono font-bold text-cyan-200 whitespace-nowrap">
        {success}/{total}
      </div>
      <div className="text-[10px] font-bold tracking-widest text-cyan-300/80 whitespace-nowrap">
        {progress}%
      </div>
      <div className="flex items-center gap-2 text-[10px] font-semibold whitespace-nowrap">
        <span className="cvp-pill cvp-pill-idle">Tổng {total}</span>
        <span className="cvp-pill cvp-pill-success">✓ {success}</span>
        <span className="cvp-pill cvp-pill-danger">✗ {failed}</span>
      </div>
    </div>
  );
}

// ─── Log panel ────────────────────────────────────────────────────────────

export function LogPanel({ log }: { log: LogEntry[] }) {
  const colorMap = {
    info:    "text-slate-300",
    success: "text-emerald-300",
    warn:    "text-amber-300",
    error:   "text-rose-300",
  };
  return (
    <div className="cvp-card cvp-log overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-500/10">
        <div className="text-[10px] uppercase tracking-widest text-emerald-400/80 font-bold inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Process Log
        </div>
        <div className="text-[10px] text-slate-500 font-mono">{log.length} entries</div>
      </div>
      <div className="max-h-44 overflow-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed">
        {log.length === 0 ? (
          <div className="text-slate-600 italic text-center py-4">Log trống — chạy job để xem output.</div>
        ) : log.map((entry, i) => (
          <div key={i} className="flex items-start gap-2 hover:bg-white/5 -mx-1 px-1 rounded">
            <span className="text-slate-600 select-none w-7 text-right shrink-0">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-slate-500 shrink-0">[{entry.ts}]</span>
            <span className={`${colorMap[entry.level]} flex-1`}>{entry.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Panel header (title + subtitle + accent bar) ─────────────────────────

export function PanelHeader({
  title, subtitle, accent = "cyan",
}: { title: string; subtitle: string; accent?: "cyan" | "violet" | "amber" }) {
  const accentMap = {
    cyan:   "from-cyan-400 to-cyan-600",
    violet: "from-violet-400 to-violet-600",
    amber:  "from-amber-400 to-amber-600",
  };
  return (
    <div className="cvp-card p-4 flex items-start gap-3">
      <div className={`w-1 self-stretch rounded-full bg-gradient-to-b ${accentMap[accent]}`} />
      <div className="flex-1 min-w-0">
        <h2 className="text-[14px] font-bold tracking-wide text-slate-100">{title}</h2>
        <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

// ─── Drop zone (for image uploads) ────────────────────────────────────────

export function DropZone({
  onFiles, label = "Kéo thả ảnh vào đây hoặc bấm chọn",
}: {
  onFiles: (files: File[]) => void;
  label?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        onFiles(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
      }}
      className={`cvp-card cvp-card-hover cursor-pointer flex flex-col items-center justify-center gap-2 py-8 transition-all ${
        hover ? "ring-2 ring-cyan-400/60 scale-[1.01]" : ""
      }`}
    >
      <input
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
      />
      <div className="w-10 h-10 rounded-full bg-cyan-500/15 ring-1 ring-cyan-400/30 grid place-items-center">
        <Sparkles size={16} className="text-cyan-300" />
      </div>
      <div className="text-[12px] text-slate-300 font-medium">{label}</div>
      <div className="text-[10px] text-slate-500">PNG · JPG · WEBP · tối đa 10MB / ảnh</div>
    </label>
  );
}
