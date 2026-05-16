interface Props {
  label: string;
  value: number;
  max: number;
  /** Free-form caption shown below the bar (e.g. "60% Of 4 Cores"). */
  caption: string;
  tone?: "emerald" | "sky" | "amber";
}

const BAR: Record<NonNullable<Props["tone"]>, string> = {
  emerald: "from-emerald-500 to-emerald-400",
  sky:     "from-sky-500 to-blue-400",
  amber:   "from-amber-500 to-orange-400",
};

export function ServerMeter({ label, value, max, caption, tone = "emerald" }: Props) {
  const pct = Math.max(0, Math.min(100, max === 0 ? 0 : (value / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-slate-700">{label}</div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${BAR[tone]} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 text-xs text-slate-500">{caption}</div>
    </div>
  );
}
