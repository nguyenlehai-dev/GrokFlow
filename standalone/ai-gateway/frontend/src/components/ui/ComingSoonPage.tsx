import { Construction } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ComingSoonPage({
  title, description,
}: { title: string; description?: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="card flex items-center gap-4 max-w-2xl">
        <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Construction size={24} className="text-amber-600" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-800">{t("header.coming_soon_title")}</h2>
          <p className="text-sm text-slate-600 mt-1">
            {description ?? t("header.coming_soon_default", { title })}
          </p>
        </div>
      </div>
    </div>
  );
}
