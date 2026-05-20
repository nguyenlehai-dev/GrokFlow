import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Webhook } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { settingsService } from "../services/settings.service";

export function SettingsWebhookTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["webhook"],
    queryFn: () => settingsService.getWebhook(),
  });
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ webhook_url: string; rotate_secret: boolean }>({
    values: { webhook_url: data?.webhook_url ?? "", rotate_secret: false },
  });
  const [revealed, setRevealed] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (payload: { webhook_url: string; rotate_secret: boolean }) =>
      settingsService.saveWebhook({
        webhook_url: payload.webhook_url || null,
        rotate_secret: payload.rotate_secret,
      }),
    onSuccess: (out) => {
      qc.invalidateQueries({ queryKey: ["webhook"] });
      if (out.new_secret) {
        setRevealed(out.new_secret);
        toast(t("settings.webhook_secret_show_once"), "success");
      } else {
        toast(t("common.saved"), "success");
      }
    },
  });

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold flex items-center gap-2 text-slate-800">
        <Webhook size={16} /> {t("settings.webhook_title")}
      </h2>
      <p className="text-sm text-slate-600">{t("settings.webhook_desc")}</p>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-2">
        <div>
          <label className="text-sm font-medium text-slate-700">{t("settings.webhook_url")}</label>
          <input
            type="url"
            placeholder={t("settings.webhook_url_placeholder")}
            className="input"
            {...register("webhook_url")}
          />
        </div>
        <label className="flex gap-2 items-center text-sm text-slate-700">
          <input type="checkbox" {...register("rotate_secret")} /> {t("settings.webhook_rotate")}
        </label>
        <button className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("common.save")}
        </button>
      </form>

      {revealed && (
        <div className="border-2 border-emerald-500 rounded p-3 space-y-2">
          <div className="font-medium text-emerald-700 text-sm">
            {t("settings.webhook_secret_show_once")}
          </div>
          <pre className="bg-slate-900 text-slate-100 p-2 rounded text-xs whitespace-pre-wrap break-all">
            {revealed}
          </pre>
          <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(revealed)}>
            {t("common.copy")}
          </button>
          <button className="btn-ghost ml-2" onClick={() => setRevealed(null)}>
            {t("common.close")}
          </button>
        </div>
      )}
    </section>
  );
}
