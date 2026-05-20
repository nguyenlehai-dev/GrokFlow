import { useTranslation } from "react-i18next";
import { Phone, Mail, MapPin, Printer } from "lucide-react";

import { NexoratechLogo } from "./NexoratechLogo";

interface Props {
  brandName?: string;
}

export function Footer({ brandName = "Nexoratech" }: Props) {
  const { t } = useTranslation();

  const COLS = [
    { title: t("landing_v2.footer_about"),   items: ["About Us", "Blog", "Careers", "Jobs", "In Press"] },
    { title: t("landing_v2.footer_support"), items: ["Contact Us", "Online Chat", "Whatsapp", "Telegram", "Ticketing"] },
    { title: t("landing_v2.footer_faq"),     items: ["Account", "Manage Deliveries", "Orders", "Payments", "Returns"] },
  ];

  return (
    <footer className="bg-slate-50 pb-10 pt-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <NexoratechLogo size={32} />
          <span className="text-xl font-bold text-slate-800">{brandName}</span>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-slate-500">
          {t("landing_v2.footer_about_intro")}{" "}
          <a href="#" className="font-medium text-blue-600">{t("landing_v2.footer_read_more")}</a>
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Contact icon={Phone}   label={t("landing_v2.footer_tel")}     value="310-437-2766" />
          <Contact icon={Mail}    label={t("landing_v2.footer_mail")}    value="hello@nexoratech.io" />
          <Contact icon={MapPin}  label={t("landing_v2.footer_address")} value="706 Campfire Ave, Meriden, CT 06450" />
          <Contact icon={Printer} label={t("landing_v2.footer_fax")}     value="+1-000-0000" />
        </div>

        <div className="mt-10 grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6">
          {COLS.concat(COLS).map((c, i) => (
            <div key={i}>
              <h4 className="text-sm font-semibold text-slate-800">{c.title}</h4>
              <ul className="mt-3 space-y-2">
                {c.items.map((it) => (
                  <li key={it}>
                    <a href="#" className="text-sm text-slate-500 hover:text-slate-800">{it}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <hr className="my-8 border-slate-200" />

        <div className="flex flex-col items-center justify-between gap-4 text-xs text-slate-500 md:flex-row">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href="#" className="hover:text-slate-800">{t("landing_v2.footer_about")}</a>
            <a href="#" className="hover:text-slate-800">{t("landing_v2.footer_contact_link")}</a>
            <a href="#" className="hover:text-slate-800">{t("landing_v2.footer_privacy")}</a>
            <a href="#" className="hover:text-slate-800">{t("landing_v2.footer_sitemap")}</a>
            <a href="#" className="hover:text-slate-800">{t("landing_v2.footer_terms")}</a>
          </div>
          <p>© 2000-2026, {t("landing_v2.footer_copyright")}</p>
        </div>
      </div>
    </footer>
  );
}

function Contact({
  icon: Icon, label, value,
}: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50">
        <Icon size={16} className="text-blue-600" />
      </span>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-0.5 text-sm font-medium text-blue-600">{value}</div>
      </div>
    </div>
  );
}
