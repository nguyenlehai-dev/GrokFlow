import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuthStore } from "@/core/auth/store";

/** Visible top-of-page banner when the user's subscription is in a
 *  non-active state. Reads `entitlements.subscription_status` echoed by
 *  `/api/auth/me`. Admin tiers skip the banner — they're flagged as
 *  `active` server-side.
 *
 *  Locales: copy lives under `billing_banner.{status}_{title|body|cta}`.
 *  `{plan}` in `_body` is replaced at render with the user's plan name.
 */
export function SubscriptionBanner() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.user?.entitlements?.subscription_status);
  const planName = useAuthStore((s) => s.user?.entitlements?.plan_name);
  const [dismissed, setDismissed] = useState(false);

  if (!status || status === "active" || status === "none") return null;
  if (dismissed) return null;

  const variant = VARIANTS[status as keyof typeof VARIANTS];
  if (!variant) return null;

  const plan = planName ?? "—";
  const headline = t(`billing_banner.${status}_title`);
  const body = t(`billing_banner.${status}_body`).replace("{plan}", plan);
  const ctaLabel = t(`billing_banner.${status}_cta`);

  return (
    <div className={`flex items-start gap-3 border-b px-4 py-2.5 ${variant.surface}`}>
      <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${variant.icon}`} />
      <div className="flex-1 text-sm">
        <span className={`font-semibold ${variant.title}`}>{headline}</span>
        <span className={`ml-2 ${variant.body}`}>{body}</span>
      </div>
      <Link to="/billing" className={`shrink-0 rounded-md px-3 py-1 text-xs font-semibold ${variant.cta}`}>
        {ctaLabel}
      </Link>
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={() => setDismissed(true)}
        className={`shrink-0 rounded-md p-1 ${variant.icon} hover:bg-black/5`}
      >
        <X size={14} />
      </button>
    </div>
  );
}

const VARIANTS = {
  past_due: {
    surface: "bg-amber-50 border-amber-200",
    icon: "text-amber-700",
    title: "text-amber-900",
    body: "text-amber-800",
    cta: "bg-amber-600 text-white hover:bg-amber-700",
  },
  expired: {
    surface: "bg-rose-50 border-rose-200",
    icon: "text-rose-700",
    title: "text-rose-900",
    body: "text-rose-800",
    cta: "bg-rose-600 text-white hover:bg-rose-700",
  },
  cancelled: {
    surface: "bg-slate-100 border-slate-200",
    icon: "text-slate-600",
    title: "text-slate-800",
    body: "text-slate-600",
    cta: "bg-slate-800 text-white hover:bg-slate-900",
  },
  pending: {
    surface: "bg-blue-50 border-blue-200",
    icon: "text-blue-700",
    title: "text-blue-900",
    body: "text-blue-800",
    cta: "bg-blue-600 text-white hover:bg-blue-700",
  },
} as const;
