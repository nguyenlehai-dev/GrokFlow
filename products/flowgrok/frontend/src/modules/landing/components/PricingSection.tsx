// ─── Pricing ───────────────────────────────────────────────────────────
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

import { TIERS } from "../configs/landing-data";
import { formatVnd } from "@/core/utils/format";
import { SectionHeader } from "./SectionHeader";

export function PricingSection() {
  const { t } = useTranslation();
  return (
    <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
      <SectionHeader
        eyebrow={t("landing.pricing_eyebrow", "Gói cước")}
        title={<>{t("landing.pricing_title_a", "Premium")} <span className="text-gradient">{t("landing.pricing_title_b", "subscription.")}</span></>}
        subtitle={t("landing.pricing_subtitle", "Hủy bất kỳ lúc nào. Không lock-in. Free tier không cần thẻ.")}
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
        {TIERS.map((tier) => (
          <div
            key={tier.code}
            className={`album-card flex flex-col h-full ${
              tier.highlight ? "ring-2 ring-accent-fuchsia shadow-glow-pink" : ""
            }`}
          >
            {tier.highlight && (
              <span className="badge-pink text-[10px] w-fit mb-3">{t("landing.pricing_popular", "⭐ Phổ biến nhất")}</span>
            )}
            <h3 className="text-xl font-bold text-white">{tier.name}</h3>
            <p className="text-sm text-slate-500 mt-1 min-h-[40px]">{tier.description}</p>
            <div className="mt-4 mb-5">
              {tier.priceVnd === 0 ? (
                <span className="text-4xl font-extrabold text-white">{t("landing.pricing_free", "Free")}</span>
              ) : tier.priceVnd === null ? (
                <span className="text-3xl font-extrabold text-white">{tier.priceLabel}</span>
              ) : (
                <span>
                  <span className="text-4xl font-extrabold text-white">{formatVnd(tier.priceVnd)}</span>
                  <span className="text-sm text-slate-500">{t("landing.pricing_per_month", "/tháng")}</span>
                </span>
              )}
            </div>
            <ul className="space-y-2 flex-1">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check size={14} className="text-accent-spotify mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to={tier.ctaTo}
              className={`mt-6 ${
                tier.highlight ? "btn-primary" : "btn-secondary"
              } w-full justify-center`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
