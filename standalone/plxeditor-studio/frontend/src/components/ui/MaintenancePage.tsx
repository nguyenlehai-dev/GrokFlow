/**
 * Maintenance screen — shown to non-admin visitors when the resolved
 * domain has `maintenance_mode=true`. Super-admin and domain admins keep
 * the regular UI so they can finish the patch.
 */
import { Wrench, Clock, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDomainStore } from "@/core/domain/store";

export function MaintenancePage() {
  const { t } = useTranslation();
  const cfg = useDomainStore((s) => s.config);
  const brand =
    (cfg?.brand_name && cfg.brand_name.trim()) ||
    (cfg?.label && cfg.label.trim()) ||
    "GrokFlow";
  const initial = (brand.charAt(0) || "G").toUpperCase();
  const message = (cfg?.maintenance_message || "").trim();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-lg w-full card-gradient text-center space-y-6 animate-fade-in">
        <div className="flex items-center justify-center gap-2.5">
          <span className="w-10 h-10 rounded-xl bg-gradient-brand text-white flex items-center justify-center font-bold text-base shadow-sm">
            {initial}
          </span>
          <span className="font-bold text-lg text-slate-900">{brand}</span>
        </div>

        <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-100 to-rose-100 flex items-center justify-center shadow-card">
          <Wrench size={36} className="text-amber-600 animate-pulse-soft" />
        </div>

        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            {t("header.maint_title_pre")} <span className="text-gradient">{t("header.maint_title_emph")}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            {t("header.maint_subtitle", { brand })}
          </p>
        </div>

        {message && (
          <div className="alert-warning text-left">
            <Clock size={18} className="shrink-0 mt-0.5" />
            <div className="text-sm whitespace-pre-line">{message}</div>
          </div>
        )}

        <div className="border-t border-slate-200 pt-5 space-y-3">
          <p className="text-xs text-slate-500">{t("header.maint_contact_hint")}</p>
          <a
            href="mailto:admin@groks.io"
            className="btn-secondary btn-sm w-fit mx-auto"
          >
            <Mail size={14} /> {t("header.maint_contact_btn")}
          </a>
        </div>

        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
          {cfg?.hostname}
        </p>
      </div>
    </div>
  );
}
