/** i18n bootstrap.
 *
 *  Resolves the active locale from (in priority order):
 *    1. user.locale stored on the backend (read at /api/auth/me, sync via setLocale below)
 *    2. localStorage key `grokflow.locale` for unauthed pages
 *    3. Browser-detected language
 *    4. 'vi' fallback
 *
 *  Translation files live in ./locales/{vi,en}.ts as plain TS objects so
 *  the bundler tree-shakes unused keys + missing-key warnings happen at
 *  compile time, not just on i18next's runtime fallback.
 */
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import { vi } from "./locales/vi";
import { en } from "./locales/en";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      vi: { translation: vi },
      en: { translation: en },
    },
    fallbackLng: "vi",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "grokflow.locale",
      caches: ["localStorage"],
    },
  });

export function setLocale(locale: string) {
  void i18n.changeLanguage(locale);
  try {
    localStorage.setItem("grokflow.locale", locale);
  } catch {
    // localStorage disabled — i18next still honours the in-memory change.
  }
}

export default i18n;
