import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  label: string;
  /** Tile accent (background tint of the icon circle). */
  tone?: "primary" | "success" | "warn" | "danger" | "neutral" | "info";
  disabled?: boolean;
  onClick?: () => void;
}

const TONES: Record<NonNullable<Props["tone"]>, string> = {
  primary: "bg-blue-50 text-blue-600 ring-blue-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn:    "bg-amber-50 text-amber-700 ring-amber-200",
  danger:  "bg-rose-50 text-rose-700 ring-rose-200",
  info:    "bg-sky-50 text-sky-600 ring-sky-200",
  neutral: "bg-slate-100 text-slate-700 ring-slate-300",
};

export function ServerActionTile({ icon: Icon, label, tone = "neutral", disabled, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-center gap-2 rounded-xl bg-white p-4
                 border border-slate-200 hover:border-blue-500/40 hover:bg-slate-100
                 disabled:opacity-40 disabled:cursor-not-allowed
                 transition-all"
    >
      <span className={`flex h-14 w-14 items-center justify-center rounded-full ring-1 ${TONES[tone]}
                        group-hover:scale-105 transition-transform`}>
        <Icon size={26} strokeWidth={1.8} />
      </span>
      <span className="text-xs font-medium text-slate-700">{label}</span>
    </button>
  );
}
