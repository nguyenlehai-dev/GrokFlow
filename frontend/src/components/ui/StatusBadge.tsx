import { cn } from "@/core/utils/cn";

// Each status maps to one of our themed badge variants from index.css. Using
// the named variants keeps StatusBadge in sync with the rest of the design
// system — if we change badge styling globally, badges here inherit it.
const palette: Record<string, string> = {
  // success / ready
  active:               "badge-emerald",
  logged_in:            "badge-emerald",
  success:              "badge-emerald",
  // queued / in flight
  queued:               "badge-cyan",
  running:              "badge-cyan",
  opening:              "badge-cyan",
  processing_provider:  "badge-cyan",
  // warning / busy
  running_job:          "badge-amber",
  need_login:           "badge-amber",
  expired:              "badge-amber",
  rate_limited:         "badge-amber",
  // danger
  failed:               "badge-rose",
  blocked:              "badge-rose",
  revoked:              "badge-rose",
  // neutral
  pending:              "badge-slate",
  created:              "badge-slate",
  cancelled:            "badge-slate",
  disabled:             "badge-slate",
};

// Friendly labels — turn `processing_provider` into "Processing", `need_login`
// into "Need login", etc. Falls back to the raw status when not mapped.
const label: Record<string, string> = {
  logged_in:            "Logged in",
  processing_provider:  "Processing",
  running_job:          "Running",
  need_login:           "Need login",
  rate_limited:         "Rate limited",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = palette[status] ?? "badge-slate";
  const text = label[status] ?? status;
  // Small leading dot gives the badge a clear "status indicator" feel even
  // before reading the text — same trick GitHub uses for issue/PR pills.
  return (
    <span className={cn(variant)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {text}
    </span>
  );
}
