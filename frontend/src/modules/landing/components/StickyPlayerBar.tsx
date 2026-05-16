// ─── Sticky player bar (docked to viewport bottom) ─────────────────────
// Mimics Spotify's persistent player. Dismissible. Hidden on small
// screens to keep mobile clean.
import { useState } from "react";
import { Minus, Heart, Disc3, ListMusic, Mic2, Pause, Play } from "lucide-react";

export function StickyPlayerBar() {
  const [dismissed, setDismissed] = useState(false);
  const [playing, setPlaying] = useState(true);
  if (dismissed) return null;
  return (
    <div
      className="hidden md:flex fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(960px,calc(100vw-2rem))] rounded-2xl border border-slate-200/70 bg-white/90 backdrop-blur-md px-4 py-3 items-center gap-4 animate-slide-up shadow-2xl"
      style={{ boxShadow: "0 24px 48px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,138,76,0.10)" }}
    >
      <div className="flex items-center gap-3 min-w-0 w-72 shrink-0">
        <div
          className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #ff8a4c 0%, #c147e9 100%)" }}
        >
          <Disc3 size={22} className={`text-white ${playing ? "animate-spin" : ""}`} style={{ animationDuration: "8s" }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">Vietnamese girl · cinematic</p>
          <p className="text-xs text-slate-500 truncate">Aurora · AI Image · 1:1</p>
        </div>
        <button className="text-slate-500 hover:text-accent-spotify">
          <Heart size={16} />
        </button>
      </div>
      <div className="flex-1 max-w-2xl mx-auto">
        <div className="flex items-center justify-center gap-5 text-slate-600">
          <button className="hover:text-slate-800"><ListMusic size={16} /></button>
          <button
            onClick={() => setPlaying((p) => !p)}
            className="w-9 h-9 rounded-full bg-white text-ink-950 flex items-center justify-center hover:scale-110 transition"
          >
            {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
          </button>
          <button className="hover:text-slate-800"><Mic2 size={16} /></button>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-9000 font-mono">
          <span>0:08</span>
          <div className="flex-1 h-0.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full w-[62%] bg-accent-spotify rounded-full" />
          </div>
          <span>0:13</span>
        </div>
      </div>
      <div className="hidden lg:flex items-center gap-2 w-56 justify-end text-slate-500 shrink-0">
        <Mic2 size={16} />
        <div className="w-24 h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full w-[70%] bg-ink-400 rounded-full" />
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 text-slate-9000 hover:text-slate-800"
          aria-label="Dismiss player"
        >
          <Minus size={16} />
        </button>
      </div>
    </div>
  );
}
