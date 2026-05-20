import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";

/** Standard rose-tinted error card used across gateway views to surface
 *  failed list-queries (HTTP status + first 200 chars of detail). */
export function ErrorPanel({ error }: { error: any }) {
  const { t } = useTranslation();
  const status = error?.response?.status;
  const detail =
    error?.response?.data?.detail ?? error?.message ?? t("gateway.error_panel_unknown");

  return (
    <div className="card border-rose-200 bg-rose-50/30">
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className="text-rose-600 mt-0.5" />
        <div>
          <h2 className="font-semibold">{t("gateway.error_panel_title")}</h2>
          <p className="text-sm text-slate-600 mt-1">
            HTTP {status ?? "?"}:{" "}
            <code>
              {typeof detail === "string"
                ? detail.slice(0, 200)
                : JSON.stringify(detail).slice(0, 200)}
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
