import { useTranslation } from "react-i18next";
import { Landmark, ShieldCheck, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Feature {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
}

export function FeatureTrio() {
  const { t } = useTranslation();
  const FEATURES: Feature[] = [
    {
      icon: Landmark,
      eyebrow: t("landing_v2.feat_accounts_eyebrow"),
      title: t("landing_v2.feat_accounts_title"),
      body: t("landing_v2.feat_accounts_body"),
    },
    {
      icon: ShieldCheck,
      eyebrow: t("landing_v2.feat_secure_eyebrow"),
      title: t("landing_v2.feat_secure_title"),
      body: t("landing_v2.feat_secure_body"),
    },
    {
      icon: BarChart3,
      eyebrow: t("landing_v2.feat_analytics_eyebrow"),
      title: t("landing_v2.feat_analytics_title"),
      body: t("landing_v2.feat_analytics_body"),
    },
  ];
  return (
    <section className="bg-slate-50 py-14 sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:gap-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, eyebrow, title, body }) => (
          <article
            key={title}
            className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm transition hover:shadow-md sm:p-7"
          >
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100">
              <Icon size={20} className="text-slate-700" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-wide text-slate-400">{eyebrow}</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-800">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
