import { Trans } from "react-i18next";
import type { TFunction } from "i18next";
import type { HelpStep } from "@/components/ui/HelpButton";

/** Demo walkthrough for the user-side billing flow.
 *
 *  Wired into `BillingPage` via `<HelpButton steps={getBillingHelpSteps(t)}/>`.
 *  Reuse this pattern on other feature pages — keep the steps as a factory
 *  function that takes a TFunction so translators / writers can edit copy
 *  in vi.ts / en.ts without touching layout code.
 */
export function getBillingHelpSteps(t: TFunction): HelpStep[] {
  return [
    {
      title: t("admin.billing_help_step1_title"),
      body: (
        <>
          <p>
            <Trans
              i18nKey="admin.billing_help_step1_p1"
              components={{ strong: <strong /> }}
            />
          </p>
          <p className="mt-2">{t("admin.billing_help_step1_p2")}</p>
        </>
      ),
      hint: t("admin.billing_help_step1_hint"),
    },
    {
      title: t("admin.billing_help_step2_title"),
      body: (
        <>
          <p>
            <Trans
              i18nKey="admin.billing_help_step2_p1"
              components={{
                kbd: <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono ring-1 ring-slate-200" />,
              }}
            />
          </p>
          <p className="mt-2">{t("admin.billing_help_step2_p2")}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            <li>
              <Trans
                i18nKey="admin.billing_help_step2_li1"
                components={{ em: <em /> }}
              />
            </li>
            <li>
              <Trans
                i18nKey="admin.billing_help_step2_li2"
                components={{ em: <em /> }}
              />
            </li>
          </ul>
        </>
      ),
    },
    {
      title: t("admin.billing_help_step3_title"),
      body: (
        <>
          <p>
            <Trans
              i18nKey="admin.billing_help_step3_p1"
              components={{
                strong: <strong />,
                em: <em />,
              }}
            />
          </p>
          <p className="mt-2">{t("admin.billing_help_step3_p2")}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            <li>
              <Trans
                i18nKey="admin.billing_help_step3_li1"
                components={{
                  code: <code className="font-mono" />,
                  pill: <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-blue-200" />,
                }}
              />
            </li>
            <li>
              <Trans
                i18nKey="admin.billing_help_step3_li2"
                components={{
                  code: <code className="font-mono" />,
                  pill: <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-blue-200" />,
                }}
              />
            </li>
            <li>
              <Trans
                i18nKey="admin.billing_help_step3_li3"
                components={{
                  code: <code className="font-mono" />,
                  pill: <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200" />,
                }}
              />
            </li>
          </ul>
        </>
      ),
      hint: t("admin.billing_help_step3_hint"),
    },
    {
      title: t("admin.billing_help_step4_title"),
      body: (
        <>
          <p>
            <Trans
              i18nKey="admin.billing_help_step4_p1"
              components={{ strong: <strong /> }}
            />
          </p>
          <p className="mt-2">
            <Trans
              i18nKey="admin.billing_help_step4_p2"
              components={{
                kbd: <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono ring-1 ring-slate-200" />,
                em: <em />,
              }}
            />
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            <li>
              <Trans
                i18nKey="admin.billing_help_step4_li1"
                components={{ strong: <strong /> }}
              />
            </li>
            <li>
              <Trans
                i18nKey="admin.billing_help_step4_li2"
                components={{
                  strong: <strong />,
                  code: <code />,
                }}
              />
            </li>
            <li>
              <Trans
                i18nKey="admin.billing_help_step4_li3"
                components={{ strong: <strong /> }}
              />
            </li>
            <li>{t("admin.billing_help_step4_li4")}</li>
          </ul>
        </>
      ),
      hint: t("admin.billing_help_step4_hint"),
    },
    {
      title: t("admin.billing_help_step5_title"),
      body: (
        <>
          <p>{t("admin.billing_help_step5_p1")}</p>
          <p className="mt-2">{t("admin.billing_help_step5_p2")}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            <li>{t("admin.billing_help_step5_li1")}</li>
            <li>
              <Trans
                i18nKey="admin.billing_help_step5_li2"
                components={{
                  strong: <strong />,
                  em: <em />,
                }}
              />
            </li>
            <li>{t("admin.billing_help_step5_li3")}</li>
          </ul>
        </>
      ),
      hint: t("admin.billing_help_step5_hint"),
    },
  ];
}

export function getBillingHelpFaq(t: TFunction): { q: string; a: string }[] {
  return [
    { q: t("admin.billing_help_faq1_q"), a: t("admin.billing_help_faq1_a") },
    { q: t("admin.billing_help_faq2_q"), a: t("admin.billing_help_faq2_a") },
    { q: t("admin.billing_help_faq3_q"), a: t("admin.billing_help_faq3_a") },
    { q: t("admin.billing_help_faq4_q"), a: t("admin.billing_help_faq4_a") },
  ];
}
