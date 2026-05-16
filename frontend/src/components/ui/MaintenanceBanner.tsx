/**
 * Sticky top banner with a marquee announcement + live countdown.
 * Shown when `domain.maintenance_starts_at` is in the future.
 */
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDomainStore } from "@/core/domain/store";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MaintenanceBanner() {
  const { t } = useTranslation();
  const cfg = useDomainStore((s) => s.config);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!cfg?.maintenance_starts_at) return null;
  if (cfg.maintenance_mode) return null;

  const startsAt = new Date(cfg.maintenance_starts_at).getTime();
  if (isNaN(startsAt)) return null;
  const remaining = startsAt - now;
  if (remaining <= 0) return null;

  const announcement = (cfg.maintenance_announcement || "").trim()
    || t("header.maint_banner_default");
  const countdown = formatRemaining(remaining);
  const countdownLine = t("header.maint_banner_countdown", { time: countdown });

  return (
    <div
      role="status"
      className="sticky top-0 z-40 bg-gradient-to-r from-amber-500 via-rose-500 to-fuchsia-600 text-white shadow-card"
    >
      <div className="flex items-center gap-3 px-4 py-2 overflow-hidden">
        <AlertTriangle size={18} className="shrink-0 animate-pulse-soft" />
        <div className="overflow-hidden flex-1 relative h-5">
          <div className="whitespace-nowrap absolute inset-0 animate-marquee">
            <span className="font-semibold mr-6">⚠️ {countdownLine} —</span>
            <span className="font-medium">{announcement}</span>
            <span className="ml-12 font-semibold">⚠️ {countdownLine} —</span>
            <span className="ml-6 font-medium">{announcement}</span>
          </div>
        </div>
        <span className="shrink-0 font-mono font-bold bg-white/20 backdrop-blur-sm px-3 py-0.5 rounded-full text-sm">
          {countdown}
        </span>
      </div>
    </div>
  );
}
