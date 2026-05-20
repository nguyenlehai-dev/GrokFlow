import { useState, type ReactNode } from "react";
import { useTranslation, Trans } from "react-i18next";
import {
  Key, Terminal, Lock, Zap, AlertTriangle, CheckCircle2, Copy,
} from "lucide-react";
import { ApiKeyModalShell } from "./ApiKeyModalShell";

const CURL_EXAMPLES = {
  verify: `curl -X POST https://YOUR-DOMAIN/api/api-keys/verify \\
  -H 'Content-Type: application/json' \\
  -d '{"key":"uxpm_live_..."}'`,
  submitJob: `curl -X POST https://YOUR-DOMAIN/api/jobs \\
  -H 'Authorization: Bearer uxpm_live_...' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "provider": "grok",
    "job_type": "image",
    "prompt": "A dragon flying over Ha Long Bay, watercolor",
    "options": { "aspect": "16:9", "size": "1024x576", "n": 1, "quality": "speed" }
  }'`,
  pollStatus: `curl https://YOUR-DOMAIN/api/jobs/<JOB_ID> \\
  -H 'Authorization: Bearer uxpm_live_...'`,
};

export function ApiKeyHelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <ApiKeyModalShell title={t("admin.apikey_help_title")} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-5 text-sm">
        {/* Intro */}
        <section className="rounded-md bg-violet-50 border border-violet-200 p-3 text-violet-900 text-xs leading-relaxed">
          <Trans
            i18nKey="admin.apikey_help_intro"
            components={{
              code: <code className="font-mono px-1 rounded bg-violet-100" />,
              strong: <strong />,
            }}
          />
        </section>

        {/* Step 1 */}
        <Step n={1} icon={Key} title={t("admin.apikey_help_step1_title")}>
          <Trans
            i18nKey="admin.apikey_help_step1_body"
            components={{
              strong: <strong />,
              em: <em />,
              code: <code className="font-mono" />,
            }}
          />
        </Step>

        {/* Step 2 */}
        <Step n={2} icon={Lock} title={t("admin.apikey_help_step2_title")}>
          <Trans
            i18nKey="admin.apikey_help_step2_body"
            components={{
              code: <code className="font-mono" />,
            }}
          />
          <CodeBlock code={CURL_EXAMPLES.verify} />
        </Step>

        {/* Step 3 */}
        <Step n={3} icon={Zap} title={t("admin.apikey_help_step3_title")}>
          <Trans
            i18nKey="admin.apikey_help_step3_body"
            components={{
              code: <code className="font-mono" />,
              strong: <strong />,
            }}
          />
          <CodeBlock code={CURL_EXAMPLES.submitJob} />
          <p className="text-xs text-slate-500 mt-2">
            <Trans
              i18nKey="admin.apikey_help_step3_hint"
              components={{ code: <code /> }}
            />
          </p>
        </Step>

        {/* Step 4 */}
        <Step n={4} icon={Terminal} title={t("admin.apikey_help_step4_title")}>
          <Trans
            i18nKey="admin.apikey_help_step4_body"
            components={{ code: <code /> }}
          />
          <CodeBlock code={CURL_EXAMPLES.pollStatus} />
          <p className="text-xs text-slate-500 mt-2">
            <Trans
              i18nKey="admin.apikey_help_step4_hint"
              components={{
                code: <code />,
                codeMono: <code className="font-mono" />,
              }}
            />
          </p>
        </Step>

        {/* Limits */}
        <Step n={5} icon={AlertTriangle} title={t("admin.apikey_help_step5_title")}>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li>
              <Trans
                i18nKey="admin.apikey_help_step5_li1"
                components={{
                  strong: <strong />,
                  code: <code />,
                }}
              />
            </li>
            <li>
              <Trans
                i18nKey="admin.apikey_help_step5_li2"
                components={{ strong: <strong /> }}
              />
            </li>
            <li>
              <Trans
                i18nKey="admin.apikey_help_step5_li3"
                components={{ strong: <strong /> }}
              />
            </li>
            <li>{t("admin.apikey_help_step5_li4")}</li>
            <li>{t("admin.apikey_help_step5_li5")}</li>
          </ul>
        </Step>

        {/* Playground tip */}
        <section className="rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-900 text-xs">
          <Trans
            i18nKey="admin.apikey_help_playground_tip"
            components={{
              strong: <strong />,
              em: <em />,
              link: <a href="/grok/playground" className="underline font-medium" />,
            }}
          />
        </section>

        <div className="flex justify-end pt-2 border-t">
          <button onClick={onClose} className="btn-primary">{t("admin.apikey_help_done")}</button>
        </div>
      </div>
    </ApiKeyModalShell>
  );
}

function Step({
  n, icon: Icon, title, children,
}: {
  n: number;
  icon: any;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 font-semibold text-slate-800 mb-1.5">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold">
          {n}
        </span>
        <Icon size={14} className="text-slate-500" />
        {title}
      </h3>
      <div className="pl-8 text-slate-600 leading-relaxed text-xs">{children}</div>
    </section>
  );
}

function CodeBlock({ code }: { code: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative mt-1">
      <pre className="rounded-md bg-slate-900 text-slate-100 p-3 text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-100"
      >
        {copied
          ? <><CheckCircle2 size={10} /> {t("admin.apikey_help_codeblock_copied")}</>
          : <><Copy size={10} /> {t("admin.apikey_help_codeblock_copy")}</>}
      </button>
    </div>
  );
}
