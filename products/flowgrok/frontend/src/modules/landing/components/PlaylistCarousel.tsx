// ─── Horizontal playlist carousel (Spotify-style) ──────────────────────
import { Play, Disc3 } from "lucide-react";

import type { PlaylistTile } from "../configs/landing-data";

export function PlaylistCarousel({
  eyebrow, title, items,
}: { eyebrow: string; title: string; items: PlaylistTile[] }) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-end justify-between mb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-blue-600 font-bold">{eyebrow}</p>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-2">{title}</h3>
        </div>
        <a href="#modules" className="text-xs uppercase tracking-wider text-slate-500 hover:text-slate-800 font-semibold">
          Show all
        </a>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 snap-x snap-mandatory">
        {items.map((p) => (
          <div
            key={p.title}
            className="group shrink-0 w-44 snap-start rounded-xl bg-white/70 hover:bg-slate-100/90 transition p-3 border border-slate-200 shadow-card-dark"
          >
            <div className={`relative aspect-square rounded-lg bg-gradient-to-br ${p.gradient} overflow-hidden shadow-card-dark`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),transparent_60%)]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Disc3 size={36} className="text-white/80" />
              </div>
              <div className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-accent-spotify text-ink-950 flex items-center justify-center shadow-brand-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition">
                <Play size={16} className="ml-0.5" />
              </div>
            </div>
            <p className="text-sm font-semibold text-white mt-3 truncate">{p.title}</p>
            <p className="text-[11px] text-slate-500 truncate">{p.subtitle}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
