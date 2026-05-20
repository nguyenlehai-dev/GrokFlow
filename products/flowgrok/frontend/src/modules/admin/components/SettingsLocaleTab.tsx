import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { setLocale } from "@/core/i18n";
import { settingsService } from "../services/settings.service";

export function SettingsLocaleTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings-locale"],
    queryFn: () => settingsService.getLocale(),
  });
  const [pick, setPick] = useState<string | null>(null);
  const current = pick ?? data?.locale ?? "vi";
  const save = useMutation({
    mutationFn: (locale: string) => settingsService.saveLocale(locale),
    onSuccess: (_data, locale) => {
      qc.invalidateQueries({ queryKey: ["settings-locale"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      // Switch i18next immediately so wrapped components re-render with
      // the new language — no F5 needed.
      setLocale(locale);
      toast(t("settings.locale_saved"), "success");
    },
  });
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold flex items-center gap-2 text-slate-800">
        <Globe size={16} /> {t("settings.tab_locale")}
      </h2>
      <p className="text-sm text-slate-600">{t("settings.locale_desc")}</p>
      <div className="flex items-center gap-3">
        <select
          className="input w-48"
          value={current}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
        <button
          className="btn-primary"
          disabled={!pick || pick === data?.locale || save.isPending}
          onClick={() => pick && save.mutate(pick)}
        >
          {save.isPending ? t("common.saving") : t("settings.locale_save")}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {t("settings.locale_current")}:{" "}
        <code className="font-mono">
          {data?.locale ?? "(auto)"}
        </code>
      </p>
    </section>
  );
}
