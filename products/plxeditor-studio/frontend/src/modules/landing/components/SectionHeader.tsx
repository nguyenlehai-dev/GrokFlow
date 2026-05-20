// ─── Reusable section header ───────────────────────────────────────────

export function SectionHeader({
  eyebrow, title, subtitle,
}: { eyebrow: string; title: React.ReactNode; subtitle: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <p className="text-xs uppercase tracking-[0.25em] text-blue-600 font-bold">{eyebrow}</p>
      <h2 className="font-display text-3xl sm:text-5xl font-bold text-white mt-3 tracking-[-0.02em]">{title}</h2>
      <p className="text-slate-600 mt-4 text-base sm:text-lg max-w-prose mx-auto">{subtitle}</p>
    </div>
  );
}
