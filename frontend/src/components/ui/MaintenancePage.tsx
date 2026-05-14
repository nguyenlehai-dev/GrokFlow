/**
 * Maintenance screen — shown to non-admin visitors when the resolved
 * domain has `maintenance_mode=true`. Super-admin and domain admins keep
 * the regular UI so they can finish the patch.
 *
 * Admins put a domain into maintenance from /admin/domains. The toggle is
 * scoped per domain — flipping one tenant does NOT take the rest of the
 * platform down.
 */
import { Wrench, Clock, Mail } from "lucide-react";
import { useDomainStore } from "@/core/domain/store";

export function MaintenancePage() {
  const cfg = useDomainStore((s) => s.config);
  // Resolve brand defensively — any of these can be null / empty string;
  // the chained `||` and final fallback guarantees a non-empty string we
  // can call `.charAt(0)` on without throwing.
  const brand =
    (cfg?.brand_name && cfg.brand_name.trim()) ||
    (cfg?.label && cfg.label.trim()) ||
    "GrokFlow";
  const initial = (brand.charAt(0) || "G").toUpperCase();
  const message = (cfg?.maintenance_message || "").trim();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-mesh p-6">
      <div className="max-w-lg w-full card-gradient text-center space-y-6 animate-fade-in">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5">
          <span className="w-10 h-10 rounded-xl bg-gradient-brand text-white flex items-center justify-center font-bold text-base shadow-brand">
            {initial}
          </span>
          <span className="font-bold text-lg text-ink-900">{brand}</span>
        </div>

        {/* Icon */}
        <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-100 to-rose-100 flex items-center justify-center shadow-card">
          <Wrench size={36} className="text-amber-600 animate-pulse-soft" />
        </div>

        {/* Headline */}
        <div>
          <h1 className="text-3xl font-bold text-ink-900 tracking-tight">
            Đang <span className="text-gradient">bảo trì</span>
          </h1>
          <p className="text-sm text-ink-500 mt-2 max-w-md mx-auto">
            Hệ thống {brand} đang được nâng cấp / sửa lỗi. Chúng tôi sẽ trở lại sớm nhất có thể.
          </p>
        </div>

        {/* Custom message from admin */}
        {message && (
          <div className="alert-warning text-left">
            <Clock size={18} className="shrink-0 mt-0.5" />
            <div className="text-sm whitespace-pre-line">{message}</div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-ink-100 pt-5 space-y-3">
          <p className="text-xs text-ink-500">
            Nếu công việc của bạn gấp, vui lòng liên hệ admin.
          </p>
          <a
            href="mailto:admin@groks.io"
            className="btn-secondary btn-sm w-fit mx-auto"
          >
            <Mail size={14} /> Liên hệ admin
          </a>
        </div>

        <p className="text-[10px] text-ink-400 font-mono uppercase tracking-wider">
          {cfg?.hostname}
        </p>
      </div>
    </div>
  );
}
