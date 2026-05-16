import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Check, Copy } from "lucide-react";

interface CreatedKeyAlertProps {
  title: string;
  description: string;
  plainKey: string;
  onClose: () => void;
}

// Banner shown immediately after a key is issued. Surfaces the plain key
// exactly once (backend hashes + discards on its end), with a copy-to-
// clipboard affordance and a "got it" dismiss. Shared between the
// per-user API Keys page and the gateway-wide Gateway Keys page.
export function CreatedKeyAlert({ title, description, plainKey, onClose }: CreatedKeyAlertProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard.writeText(plainKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="card border-amber-300 bg-amber-50">
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-slate-700 mt-1">{description}</p>
          <div className="mt-2 flex items-center gap-2 bg-slate-900 text-emerald-700 font-mono text-xs px-3 py-2 rounded">
            <code className="flex-1 truncate">{plainKey}</code>
            <button
              onClick={onCopy}
              className="p-1 rounded hover:bg-slate-700 text-slate-400"
              title={t("gateway.created_key_copy")}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <button onClick={onClose} className="btn-ghost text-xs mt-2">{t("gateway.created_key_dismiss")}</button>
        </div>
      </div>
    </div>
  );
}
