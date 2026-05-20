import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { useAuthStore } from "@/core/auth/store";

import type { PublicPlan } from "../models/plans";
import { plansPublicService } from "../services/plans-public.service";
import { formatVnd } from "@/core/utils/format";

// Marketing taglines per plan code (i18n keys, resolved at render time)
const TAGLINE_KEYS: Record<string, string[]> = {
  free: ["pricing_tagline_free_1", "pricing_tagline_free_2"],
  basic: [
    "pricing_tagline_basic_1",
    "pricing_tagline_basic_2",
    "pricing_tagline_basic_3",
    "pricing_tagline_basic_4",
  ],
  pro: [
    "pricing_tagline_pro_1",
    "pricing_tagline_pro_2",
    "pricing_tagline_pro_3",
    "pricing_tagline_pro_4",
    "pricing_tagline_pro_5",
    "pricing_tagline_pro_6",
  ],
  enterprise: [
    "pricing_tagline_enterprise_1",
    "pricing_tagline_enterprise_2",
    "pricing_tagline_enterprise_3",
    "pricing_tagline_enterprise_4",
  ],
};

export function PricingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");

  const { data: plans, isLoading } = useQuery({
    queryKey: ["plans-public"],
    queryFn: () => plansPublicService.list(),
  });

  const currentPlanCode = me?.entitlements?.plan_code;

  if (isLoading) return <p className="text-slate-500">{t("landing.pricing_loading")}</p>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">{t("landing.pricing_page_title")}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("landing.pricing_page_subtitle")}
          </p>
        </div>
        {/* Billing cycle toggle */}
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
          <CycleBtn active={cycle === "monthly"} onClick={() => setCycle("monthly")}>{t("landing.pricing_cycle_monthly")}</CycleBtn>
          <CycleBtn active={cycle === "yearly"} onClick={() => setCycle("yearly")}>
            {t("landing.pricing_cycle_yearly")} <span className="ml-1 text-xs text-emerald-600 font-bold">-17%</span>
          </CycleBtn>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(plans ?? []).map((p) => {
          const isCurrent = p.code === currentPlanCode;
          const isHighlight = p.code === "pro";
          const taglines = TAGLINE_KEYS[p.code] ?? [];
          const priceDisplay =
            p.price_vnd === null
              ? t("landing.pricing_contact_us")
              : p.price_vnd === 0
              ? t("landing.pricing_free_label")
              : cycle === "yearly"
              ? formatVnd(p.price_vnd * 10)  // 2 months free
              : formatVnd(p.price_vnd);

          return (
            <div
              key={p.id}
              className={`rounded-xl border bg-white p-5 flex flex-col ${
                isHighlight ? "border-brand-500 ring-2 ring-brand-100 shadow-md" : "border-slate-200"
              } ${isCurrent ? "ring-2 ring-emerald-300" : ""}`}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-slate-800">{p.name}</h3>
                {isCurrent && (
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">
                    {t("landing.pricing_current_badge")}
                  </span>
                )}
                {isHighlight && !isCurrent && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-100 text-brand-700">
                    {t("landing.pricing_popular_badge")}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1 min-h-[2.5rem]">{p.description}</p>

              <div className="mt-4">
                <span className="text-3xl font-bold text-slate-800">{priceDisplay}</span>
                {p.price_vnd && p.price_vnd > 0 && (
                  <span className="text-sm text-slate-500"> / {cycle === "yearly" ? t("landing.pricing_per_year") : t("landing.pricing_per_month_short")}</span>
                )}
              </div>

              <ul className="mt-4 space-y-1.5 text-sm flex-1">
                {taglines.map((key) => (
                  <li key={key} className="flex items-start gap-2 text-slate-700">
                    <Check size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>{t(`landing.${key}`)}</span>
                  </li>
                ))}
              </ul>

              <PlanCTA
                plan={p}
                isCurrent={isCurrent}
                onCheckout={() => navigate(`/checkout/${p.code}?cycle=${cycle}`)}
              />
            </div>
          );
        })}
      </div>

      <p className="text-center text-sm text-slate-500">
        {t("landing.pricing_questions")} <Link to="/billing" className="text-brand-600 hover:underline">{t("landing.pricing_back_to_billing")}</Link>
      </p>
    </div>
  );
}

function CycleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded transition ${
        active ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function PlanCTA({
  plan, isCurrent, onCheckout,
}: { plan: PublicPlan; isCurrent: boolean; onCheckout: () => void }) {
  const { t } = useTranslation();
  if (isCurrent) {
    return (
      <button
        disabled
        className="mt-5 block w-full text-center px-4 py-2 rounded-md font-medium bg-slate-100 text-slate-500 cursor-default"
      >
        {t("landing.pricing_cta_current")}
      </button>
    );
  }
  if (plan.price_vnd === null) {
    return (
      <a
        href="mailto:sales@grokflow.io"
        className="mt-5 block text-center px-4 py-2 rounded-md font-medium bg-slate-100 text-slate-800 hover:bg-slate-200"
      >
        {t("landing.pricing_cta_contact_sales")}
      </a>
    );
  }
  if (plan.price_vnd === 0) {
    return (
      <button
        disabled
        className="mt-5 block w-full text-center px-4 py-2 rounded-md font-medium bg-slate-100 text-slate-500 cursor-default"
      >
        {t("landing.pricing_cta_default_plan")}
      </button>
    );
  }
  return (
    <button
      onClick={onCheckout}
      className="mt-5 block w-full text-center px-4 py-2 rounded-md font-medium bg-brand-600 text-white hover:bg-brand-700"
    >
      {t("landing.pricing_cta_choose_plan", { name: plan.name })}
    </button>
  );
}
