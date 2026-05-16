// ─── Genre pills ───────────────────────────────────────────────────────
import { GENRES } from "../configs/landing-data";

export function GenrePills() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-bold mb-4">
        Browse by genre
      </p>
      <div className="flex flex-wrap gap-2">
        {GENRES.map((g) => (
          <span
            key={g.label}
            className="rounded-full bg-white hover:bg-slate-100 border border-slate-200 hover:border-brand-400/60 px-4 py-1.5 text-sm font-medium text-slate-700 hover:text-slate-800 cursor-pointer transition-colors"
          >
            {g.label}
          </span>
        ))}
      </div>
    </section>
  );
}
