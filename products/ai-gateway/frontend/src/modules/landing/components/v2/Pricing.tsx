import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";

interface Plan {
  name: string;
  description: string;
  monthly: number;
  yearly: number;
  highlighted?: boolean;
  features: { label: string; included: boolean }[];
}

export function Pricing() {
  const { t } = useTranslation();
  const [yearly, setYearly] = useState(false);

  const PLANS: Plan[] = [
    {
      name: "Freebie",
      description: t("landing_v2.pricing_freebie_desc"),
      monthly: 0, yearly: 0,
      features: [
        { label: "1.000 API calls / tháng", included: true },
        { label: "1 domain, 1 user", included: true },
        { label: "Audit log 7 ngày", included: false },
        { label: "Multi-domain", included: false },
        { label: "Custom rate limit", included: false },
        { label: "SSO / SCIM", included: false },
        { label: "24/7 support", included: false },
        { label: "Access to design system", included: false },
        { label: "Team collaboration", included: false },
      ],
    },
    {
      name: "Professional",
      description: t("landing_v2.pricing_pro_desc"),
      monthly: 25, yearly: 19,
      highlighted: true,
      features: [
        { label: "100.000 API calls / tháng", included: true },
        { label: "5 domain, unlimited user", included: true },
        { label: "Audit log 30 ngày", included: true },
        { label: "Multi-domain", included: true },
        { label: "Custom rate limit", included: true },
        { label: "Email support", included: true },
        { label: "Webhook + retry", included: true },
        { label: "Access to design system", included: false },
        { label: "Team collaboration", included: false },
      ],
    },
    {
      name: "Enterprise",
      description: t("landing_v2.pricing_enterprise_desc"),
      monthly: 100, yearly: 75,
      features: [
        { label: "Unlimited API calls", included: true },
        { label: "Unlimited domain & user", included: true },
        { label: "Audit log lifetime", included: true },
        { label: "Multi-domain", included: true },
        { label: "Custom rate limit", included: true },
        { label: "SSO / SCIM", included: true },
        { label: "Dedicated 24/7 support", included: true },
        { label: "Access to design system", included: true },
        { label: "Team collaboration", included: true },
      ],
    },
  ];

  return (
    <section className="bg-gradient-to-b from-slate-50 via-white to-slate-50 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <header className="text-center">
          <h2 className="text-2xl font-bold text-slate-800 sm:text-3xl md:text-4xl">
            {t("landing_v2.pricing_title_a")}{" "}
            <span className="bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">
              {t("landing_v2.pricing_title_b")}
            </span>
          </h2>
          <p className="mt-3 text-sm text-slate-500 sm:text-base">{t("landing_v2.pricing_subtitle")}</p>

          <div className="mt-6 inline-flex items-center gap-4">
            <span className={!yearly ? "text-slate-800 font-medium" : "text-slate-400"}>
              {t("landing_v2.pricing_monthly")}
            </span>
            <button
              role="switch"
              aria-checked={yearly}
              onClick={() => setYearly((v) => !v)}
              className={`relative h-7 w-12 rounded-full transition ${yearly ? "bg-blue-600" : "bg-slate-200"}`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                  yearly ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
            <span className={yearly ? "text-slate-800 font-medium" : "text-slate-400"}>
              {t("landing_v2.pricing_yearly")}
            </span>
            <span className="relative inline-block text-sm font-semibold text-blue-600">
              <svg viewBox="0 0 60 30" className="absolute -left-12 -top-3 h-8 w-12 stroke-blue-600">
                <path d="M2 24 Q 25 4 56 18" fill="none" strokeWidth="2" strokeLinecap="round" />
                <path d="M48 12 L 56 18 L 48 22" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t("landing_v2.pricing_save")}
            </span>
          </div>
        </header>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((p) => (
            <PlanCard key={p.name} plan={p} yearly={yearly} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCard({
  plan, yearly, t,
}: { plan: Plan; yearly: boolean; t: (k: string) => string }) {
  const price = yearly ? plan.yearly : plan.monthly;
  const highlighted = plan.highlighted;

  return (
    <article
      className={`flex flex-col rounded-2xl p-6 shadow-sm ring-1 sm:p-8 ${
        highlighted
          ? "bg-blue-600 text-white ring-blue-600 shadow-xl lg:scale-[1.02]"
          : "bg-white text-slate-800 ring-slate-100"
      }`}
    >
      <h3 className={`text-xl font-bold ${highlighted ? "text-white" : "text-slate-800"}`}>
        {plan.name}
      </h3>
      <p className={`mt-2 text-sm ${highlighted ? "text-blue-100" : "text-slate-500"}`}>
        {plan.description}
      </p>

      <div className="mt-6 flex items-baseline gap-1">
        <span className="text-5xl font-bold">${price}</span>
        <span className={`text-sm ${highlighted ? "text-blue-100" : "text-slate-400"}`}>
          {t("landing_v2.pricing_per_month")}
        </span>
      </div>

      <button
        className={`mt-6 rounded-md py-2.5 text-sm font-semibold transition ${
          highlighted
            ? "bg-white text-blue-700 hover:bg-blue-50"
            : "border border-blue-600 text-blue-600 hover:bg-blue-50"
        }`}
      >
        {t("landing_v2.pricing_get_started")}
      </button>

      <ul className="mt-8 space-y-3">
        {plan.features.map((f) => (
          <li
            key={f.label}
            className={`flex items-center gap-3 text-sm ${
              f.included
                ? highlighted
                  ? "text-white"
                  : "text-slate-700"
                : highlighted
                  ? "text-white/60"
                  : "text-slate-400"
            }`}
          >
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                f.included
                  ? highlighted
                    ? "bg-white/20 text-white"
                    : "bg-blue-100 text-blue-600"
                  : "border border-current"
              }`}
            >
              {f.included ? <Check size={12} /> : <X size={12} />}
            </span>
            {f.label}
          </li>
        ))}
      </ul>
    </article>
  );
}
