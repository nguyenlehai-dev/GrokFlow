// ─── App preview (Spotify-style mockup) ────────────────────────────────
// Faux streaming-app shell embedded in the landing page so visitors
// instantly recognise the "music app" framing. Sidebar (Home/Search/
// Library + playlists), main grid (greeting + Recently played tiles +
// Made For You row), and a docked player bar at the bottom of the
// frame.
import {
  Sparkles, Play, Globe, Heart, Disc3, ListMusic, Mic2, Pause,
} from "lucide-react";

import {
  SIDEBAR_PLAYLISTS,
  QUICK_TILES,
  MADE_FOR_YOU_TILES,
} from "../configs/landing-data";

export function AppPreview() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mb-24 relative z-10">
      <div className="relative rounded-2xl bg-black border border-slate-200 overflow-hidden shadow-2xl">
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-black">
          <span className="w-3 h-3 rounded-full bg-rose-500/80" />
          <span className="w-3 h-3 rounded-full bg-amber-400/80" />
          <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
          <div className="ml-3 flex-1 max-w-md mx-auto flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-slate-500">
            <Sparkles size={11} className="text-accent-spotify" />
            studio · GrokFlow workspace
          </div>
        </div>

        {/* App body */}
        <div className="grid grid-cols-[220px_1fr] min-h-[460px]">
          {/* Sidebar — true black, Spotify-style */}
          <aside className="bg-black border-r border-ink-900 p-4 space-y-6">
            <div className="space-y-1.5">
              {[
                { icon: ListMusic, label: "Home",   active: true },
                { icon: Globe,     label: "Search", active: false },
                { icon: Heart,     label: "Library",active: false },
              ].map((it) => (
                <div
                  key={it.label}
                  className={`flex items-center gap-3 px-3 py-1.5 rounded text-sm font-bold ${
                    it.active ? "text-white" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <it.icon size={18} />
                  {it.label}
                </div>
              ))}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold px-3 mb-2">Your library</p>
              <div className="space-y-1 text-sm">
                {SIDEBAR_PLAYLISTS.map((p, i) => (
                  <div
                    key={p}
                    className={`px-3 py-1 rounded hover:text-slate-800 truncate ${i === 0 ? "text-white font-semibold" : "text-slate-500"}`}
                  >
                    {p}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Main panel — subtle Aurora-tinted header fading into the
              ink-950 base, so the mock reads as a real "album-tinted"
              streaming view, not a flat dark surface. */}
          <div
            className="p-6 overflow-hidden"
            style={{
              background:
                "linear-gradient(180deg, rgba(193,71,233,0.18) 0%, rgba(11,13,23,0.5) 40%, #0b0d17 100%)",
            }}
          >
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              Good evening
            </p>
            <h3 className="text-2xl font-extrabold text-white mt-1">
              Đâu là dự án bạn muốn chạy?
            </h3>

            {/* Quick tiles 3x2 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
              {QUICK_TILES.map((q) => (
                <div
                  key={q.name}
                  className="group flex items-center gap-3 rounded-md bg-slate-100 hover:bg-slate-200/70 transition pr-3 overflow-hidden"
                >
                  <div className={`w-12 h-12 bg-gradient-to-br ${q.gradient} flex items-center justify-center shrink-0`}>
                    <Disc3 size={20} className="text-white" />
                  </div>
                  <span className="text-sm font-semibold text-white truncate">{q.name}</span>
                </div>
              ))}
            </div>

            {/* Made for you row */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-white">Made for you</h4>
                <span className="text-xs text-slate-500">Hôm nay</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                {MADE_FOR_YOU_TILES.map((m) => (
                  <div key={m.title} className="rounded-lg bg-slate-100 p-2.5 hover:bg-slate-100/85 transition group">
                    <div className={`aspect-square rounded-md bg-gradient-to-br ${m.gradient} relative overflow-hidden shadow-card-dark`}>
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),transparent_60%)]" />
                      <div className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-accent-spotify text-ink-950 flex items-center justify-center shadow-brand-lg opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition">
                        <Play size={16} className="ml-0.5" />
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-white mt-2 truncate">{m.title}</p>
                    <p className="text-[11px] text-slate-500 truncate">{m.subtitle}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Mini player bar at the bottom of the frame — Spotify-style
            true black background. */}
        <div className="border-t border-slate-200 bg-black px-4 py-2.5 flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 w-48">
            <div
              className="w-10 h-10 rounded shrink-0 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #ff8a4c 0%, #c147e9 100%)" }}
            >
              <Disc3 size={18} className="text-white animate-spin" style={{ animationDuration: "8s" }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">Vietnamese girl · cinematic</p>
              <p className="text-[10px] text-slate-500">Aurora · AI Image</p>
            </div>
          </div>
          <div className="flex-1 max-w-xl mx-auto">
            <div className="flex items-center justify-center gap-4 text-slate-500">
              <button className="hover:text-slate-800"><ListMusic size={14} /></button>
              <button className="w-7 h-7 rounded-full bg-white text-slate-900 flex items-center justify-center hover:scale-110 transition">
                <Pause size={13} />
              </button>
              <button className="hover:text-slate-800"><Heart size={14} /></button>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-9000 font-mono">
              <span>0:08</span>
              <div className="flex-1 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full w-[62%] bg-accent-spotify rounded-full" />
              </div>
              <span>0:13</span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 w-48 justify-end text-slate-500">
            <Mic2 size={14} />
            <div className="w-20 h-0.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full w-[70%] bg-ink-400 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
