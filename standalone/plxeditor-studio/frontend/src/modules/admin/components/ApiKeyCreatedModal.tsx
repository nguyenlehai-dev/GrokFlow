import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { CheckCircle2, Copy } from "lucide-react";
import { ApiKeyModalShell } from "./ApiKeyModalShell";

export function ApiKeyCreatedModal({
  value, onClose,
}: {
  value: { name: string; api_key: string };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <ApiKeyModalShell title={t("admin.apikey_created_title")} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          <Trans
            i18nKey="admin.apikey_created_desc"
            values={{ name: value.name }}
            components={{ strong: <strong /> }}
          />
        </p>
        <pre className="rounded-md bg-slate-900 p-3 text-xs text-slate-100 whitespace-pre-wrap break-all">
          {value.api_key}
        </pre>
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            {copied
              ? <><CheckCircle2 size={14} /> {t("admin.apikey_created_copied")}</>
              : <><Copy size={14} /> {t("admin.apikey_created_copy")}</>}
          </button>
          <button className="btn-ghost" onClick={onClose}>{t("admin.apikey_created_saved")}</button>
        </div>
      </div>
    </ApiKeyModalShell>
  );
}
