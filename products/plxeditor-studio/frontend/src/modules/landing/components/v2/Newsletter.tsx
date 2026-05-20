import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";

export function Newsletter() {
  const { t } = useTranslation();
  return (
    <section className="bg-slate-50 pt-14 sm:pt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col items-center gap-6 rounded-2xl bg-blue-600 px-5 py-6 text-white sm:px-8 sm:py-7 md:flex-row md:justify-between">
          <div className="text-center md:text-left">
            <h3 className="text-lg font-semibold">{t("landing_v2.newsletter_title")}</h3>
            <p className="mt-0.5 text-sm text-blue-100">{t("landing_v2.newsletter_sub")}</p>
          </div>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex w-full max-w-md items-center gap-2 rounded-md bg-blue-700/40 p-1.5 ring-1 ring-blue-400/40"
          >
            <Mail size={16} className="ml-2 text-blue-100" />
            <input
              type="email"
              placeholder={t("landing_v2.newsletter_placeholder")}
              className="flex-1 bg-transparent px-2 py-1.5 text-sm text-white placeholder:text-blue-200/70 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-white px-4 py-1.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
            >
              {t("landing_v2.newsletter_submit")}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
