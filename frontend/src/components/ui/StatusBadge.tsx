import { cn } from "@/core/utils/cn";

const palette: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  logged_in: "bg-emerald-100 text-emerald-700",
  success: "bg-emerald-100 text-emerald-700",
  pending: "bg-slate-100 text-slate-600",
  created: "bg-slate-100 text-slate-600",
  queued: "bg-blue-100 text-blue-700",
  running: "bg-blue-100 text-blue-700",
  opening: "bg-blue-100 text-blue-700",
  processing_provider: "bg-blue-100 text-blue-700",
  running_job: "bg-amber-100 text-amber-700",
  need_login: "bg-amber-100 text-amber-700",
  expired: "bg-amber-100 text-amber-700",
  failed: "bg-rose-100 text-rose-700",
  blocked: "bg-rose-100 text-rose-700",
  revoked: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-600",
  disabled: "bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={cn("badge", palette[status] ?? "bg-slate-100 text-slate-600")}>{status}</span>;
}
