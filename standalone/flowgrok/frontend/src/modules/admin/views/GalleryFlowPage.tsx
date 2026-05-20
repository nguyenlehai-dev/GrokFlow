import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Film, Music, Image as ImageIcon, Loader2, Download, Layers,
  ChevronLeft, ChevronRight, Search, FileVideo, FileArchive,
  Play, Pause, Volume2, VolumeX,
} from "lucide-react";
import { galleryFlowService, type FlowGalleryItem } from "../services/galleryFlow.service";


type Kind = "" | "video" | "audio" | "frame";

const TABS: { key: Kind; label: string; icon: typeof Film; bg: string; accent: string }[] = [
  { key: "",      label: "Tất cả",  icon: Layers,    bg: "bg-slate-100",   accent: "text-slate-600" },
  { key: "video", label: "Video",   icon: Film,      bg: "bg-violet-100",  accent: "text-violet-600" },
  { key: "audio", label: "Âm thanh", icon: Music,    bg: "bg-emerald-100", accent: "text-emerald-600" },
  { key: "frame", label: "Frames",  icon: ImageIcon, bg: "bg-amber-100",   accent: "text-amber-600" },
];

const OP_LABELS: Record<string, string> = {
  "cut":            "Cắt video",
  "merge":          "Ghép video",
  "extract-audio":  "Tách audio",
  "add-audio":      "Ghép audio",
  "speed":          "Đổi tốc độ",
  "resize":         "Resize",
  "crop":           "Crop",
  "extract-frames": "Trích frame",
};

function fmtBytes(b: number | null): string {
  if (!b) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`;
}

function fmtDuration(s: number | null): string {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(s % 1 ? 1 : 0);
  return m > 0 ? `${m}m${sec}s` : `${sec}s`;
}

function fmtRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m}m trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h trước`;
  return `${Math.floor(h / 24)}d trước`;
}


export function GalleryFlowPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlKind = searchParams.get("kind") as Kind | null;
  const [kind, setKind] = useState<Kind>(urlKind || "");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 24;

  // Keep kind state in sync when URL changes (sidebar click).
  useEffect(() => {
    setKind((urlKind as Kind) || "");
    setPage(0);
  }, [urlKind]);

  const switchKind = (k: Kind) => {
    setKind(k);
    setPage(0);
    if (k) setSearchParams({ kind: k });
    else setSearchParams({});
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["gallery-flow", kind, page],
    queryFn: () => galleryFlowService.list({
      output_kind: kind || undefined,
      offset: page * limit,
      limit,
    }),
    refetchInterval: 30_000,
  });

  // In-memory search filter (only filenames + operation labels; cheap)
  const filtered = (data?.items ?? []).filter((it) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (it.output_filename ?? "").toLowerCase().includes(q)
      || it.operation.toLowerCase().includes(q)
      || (OP_LABELS[it.operation] || "").toLowerCase().includes(q)
      || (it.user_email ?? "").toLowerCase().includes(q)
    );
  });

  // Stats per kind from current page (rough summary box).
  const stats = (data?.items ?? []).reduce(
    (acc, it) => {
      acc.total++;
      acc.bytes += it.file_size ?? 0;
      acc.duration += it.duration ?? 0;
      return acc;
    },
    { total: 0, bytes: 0, duration: 0 },
  );

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 grid place-items-center">
            <Film size={20} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Flow Gallery</h1>
            <p className="text-sm text-slate-500">
              Kết quả các tool xử lý video: cắt, ghép, tách audio, resize, crop, ...
            </p>
          </div>
        </div>
      </header>

      {/* Tabs row */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = kind === t.key;
          return (
            <button
              key={t.key || "all"}
              onClick={() => switchKind(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition ${
                active
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              <span className={`w-5 h-5 rounded-full grid place-items-center ${active ? "bg-white/15" : t.bg}`}>
                <Icon size={11} className={active ? "text-white" : t.accent} />
              </span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Stats + search */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard icon={Layers} label="Kết quả trang" value={String(stats.total)} hint={`${data?.total ?? 0} tổng`} />
        <StatCard icon={FileArchive} label="Tổng dung lượng" value={fmtBytes(stats.bytes)} hint="trên trang hiện tại" />
        <StatCard icon={Music} label="Tổng thời lượng" value={fmtDuration(stats.duration)} hint="trên trang hiện tại" />
        <div className="card flex items-center gap-2 px-3 py-2">
          <Search size={14} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên file / operation / user"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 size={20} className="animate-spin mr-2" /> Đang tải…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState kind={kind} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((it) => <FlowCard key={it.job_id} item={it} />)}
        </div>
      )}

      {/* Pagination */}
      {(data?.total ?? 0) > limit && (
        <footer className="flex items-center justify-between border-t border-slate-200 pt-4">
          <div className="text-xs text-slate-500">
            Trang <strong>{page + 1}</strong> / {totalPages} · {data?.total ?? 0} kết quả
            {isFetching && <span className="ml-2 text-slate-400">đang tải…</span>}
          </div>
          <div className="flex items-center gap-1">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
              className="btn-ghost text-sm inline-flex items-center gap-1 disabled:opacity-40">
              <ChevronLeft size={14} /> Prev
            </button>
            <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="btn-ghost text-sm inline-flex items-center gap-1 disabled:opacity-40">
              Next <ChevronRight size={14} />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}


function StatCard({ icon: Icon, label, value, hint }: { icon: typeof Film; label: string; value: string; hint?: string }) {
  return (
    <div className="card px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Icon size={12} /> {label}
      </div>
      <div className="text-xl font-semibold text-slate-900 mt-1">{value}</div>
      {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}


function FlowCard({ item }: { item: FlowGalleryItem }) {
  const kind = item.output_kind;
  const opLabel = OP_LABELS[item.operation] ?? item.operation;
  const kindMeta = TABS.find((t) => t.key === kind)!;
  const KindIcon = kindMeta.icon;
  return (
    <div className="group relative rounded-xl border border-slate-200 bg-white overflow-hidden hover:shadow-lg hover:border-violet-300 transition-all duration-150">
      {/* Media preview */}
      <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 grid place-items-center relative overflow-hidden">
        {kind === "video" && item.output_url ? (
          <video
            src={item.output_url}
            className="w-full h-full object-contain"
            controls
            preload="metadata"
            onError={(e) => {
              // hide broken video; rely on the icon fallback shown via CSS
              (e.target as HTMLVideoElement).style.display = "none";
            }}
          />
        ) : kind === "audio" && item.output_url ? (
          <AudioPlayer src={item.output_url} duration={item.duration} />
        ) : kind === "frame" ? (
          <div className="flex flex-col items-center gap-2 text-amber-300">
            <FileArchive size={42} />
            <span className="text-xs font-mono opacity-80">{item.output_filename?.split(".").pop()?.toUpperCase()}</span>
          </div>
        ) : (
          <FileVideo size={42} className="text-slate-500" />
        )}
        {/* Kind badge top-right */}
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/40 text-white text-[10px] uppercase tracking-wider backdrop-blur">
          <KindIcon size={10} /> {kind || "media"}
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${kindMeta.bg} ${kindMeta.accent}`}>
            {opLabel}
          </span>
          {item.output_url && (
            <a
              href={item.output_url}
              download
              className="opacity-0 group-hover:opacity-100 transition text-slate-500 hover:text-violet-600"
              title="Download"
            >
              <Download size={14} />
            </a>
          )}
        </div>
        <div className="text-sm font-medium text-slate-900 truncate" title={item.output_filename ?? ""}>
          {item.output_filename ?? "—"}
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <FileVideo size={11} /> {fmtBytes(item.file_size)}
          </span>
          <span>{fmtDuration(item.duration)}</span>
        </div>
        <div className="flex items-center justify-between text-[10px] pt-2 border-t border-slate-100">
          <span className="text-slate-400 truncate flex-1">{item.user_email ?? "—"}</span>
          <span className="text-slate-400">{fmtRelTime(item.completed_at ?? item.created_at)}</span>
        </div>
      </div>
    </div>
  );
}


function fmtClock(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}


function AudioPlayer({ src, duration: hintDuration }: { src: string; duration: number | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(hintDuration ?? 0);
  const [muted, setMuted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onMeta = () => { setTotal(a.duration); setLoaded(true); };
    const onEnd  = () => { setPlaying(false); setCurrent(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else         { a.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !total) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = pct * total;
    setCurrent(a.currentTime);
  };

  const toggleMute = () => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = !a.muted;
    setMuted(a.muted);
  };

  const progressPct = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-950">
      {/* Animated equalizer bars background — only spin when playing */}
      <div className="absolute inset-0 flex items-end justify-center gap-1 px-6 pb-12 pointer-events-none opacity-30">
        {Array.from({ length: 32 }).map((_, i) => (
          <span
            key={i}
            className={`flex-1 rounded-t bg-emerald-400 ${playing ? "anim-eq" : ""}`}
            style={{
              height: `${20 + ((i * 37) % 60)}%`,
              animationDelay: `${(i % 8) * 0.12}s`,
            }}
          />
        ))}
      </div>

      {/* Centered content */}
      <div className="relative h-full flex flex-col items-center justify-center gap-4 px-5">
        <button
          onClick={toggle}
          className="w-14 h-14 rounded-full bg-emerald-400 text-slate-900 grid place-items-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="translate-x-0.5" />}
        </button>

        {/* Scrubber */}
        <div className="w-full max-w-[260px] space-y-1.5">
          <div
            className="h-1.5 rounded-full bg-white/15 cursor-pointer relative group/scrub"
            onClick={seek}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-emerald-400"
              style={{ width: `${progressPct}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover/scrub:opacity-100 transition"
              style={{ left: `calc(${progressPct}% - 6px)` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-white/70">
            <span>{fmtClock(current)}</span>
            <button
              onClick={toggleMute}
              className="hover:text-white transition"
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
            </button>
            <span>{loaded || hintDuration ? fmtClock(total) : "—"}</span>
          </div>
        </div>
      </div>

      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
}


function EmptyState({ kind }: { kind: Kind }) {
  const tab = TABS.find((t) => t.key === kind);
  const Icon = tab?.icon ?? Layers;
  return (
    <div className="py-20 text-center">
      <div className={`inline-flex w-16 h-16 rounded-full grid place-items-center ${tab?.bg ?? "bg-slate-100"} mb-4`}>
        <Icon size={28} className={tab?.accent ?? "text-slate-400"} />
      </div>
      <h3 className="text-base font-semibold text-slate-700">Chưa có kết quả</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        {kind === "video" && "User chưa chạy tool nào tạo video (cut, merge, resize, crop, speed, add-audio)."}
        {kind === "audio" && "Chưa có audio nào — chạy tool Tách âm thanh để có dữ liệu."}
        {kind === "frame" && "Chưa có frame nào — chạy tool Trích frame từ video."}
        {!kind && "Chưa có Flow job hoàn thành nào."}
      </p>
    </div>
  );
}
