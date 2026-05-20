import { useTranslation } from "react-i18next";

const LOGOS = ["coinbase", "Spotify", "slack", "Dropbox", "webflow", "zoom"];

export function TrustedBy() {
  const { t } = useTranslation();
  return (
    <section className="bg-gradient-to-b from-sky-100/80 via-sky-50 to-slate-50 py-10 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-center text-xs text-slate-500 sm:text-sm">{t("landing_v2.trusted")}</p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-slate-400 sm:mt-8 sm:gap-x-14 sm:gap-y-6">
          {LOGOS.map((l) => (
            <li key={l} className="text-lg font-semibold tracking-tight sm:text-2xl">{l}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
