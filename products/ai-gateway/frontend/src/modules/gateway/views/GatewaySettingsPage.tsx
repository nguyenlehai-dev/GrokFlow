import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Wrench } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { GatewayAuthGuard } from "../components/GatewayAuthGuard";
import { ErrorPanel } from "../components/ErrorPanel";
import { extractError } from "../utils/common";
import { settingsService } from "../services/settings.service";
import type { AutomationSettings } from "../models/settings";

export function GatewaySettingsPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["gw-settings"],
    queryFn: () => settingsService.get(),
    retry: false,
  });

  const { register, handleSubmit, reset } = useForm<AutomationSettings>();

  useEffect(() => {
    if (data) reset(data.automation);
  }, [data, reset]);

  const save = useMutation({
    mutationFn: (v: AutomationSettings) =>
      settingsService.update({
        automation: {
          ...v,
          concurrency: Number(v.concurrency),
          timeout_ms: Number(v.timeout_ms),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-settings"] });
      toast(t("gateway.gw_settings_saved"), "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  if (isLoading) return <p className="text-slate-500">{t("gateway.gw_settings_loading")}</p>;
  if (error) return <ErrorPanel error={error} />;

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="page-title flex items-center gap-2">
        <Wrench size={22} /> {t("gateway.gw_settings_title")}
      </h1>

      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="card space-y-3">
        <h2 className="font-semibold">{t("gateway.gw_settings_automation")}</h2>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("headless")} />
          <span>{t("gateway.gw_settings_headless")}</span>
        </label>

        <div>
          <label className="text-sm font-medium">{t("gateway.gw_settings_concurrency")}</label>
          <input className="input" type="number" min={1} max={20}
            {...register("concurrency", { valueAsNumber: true, required: true })} />
          <p className="text-xs text-slate-500 mt-1">
            {t("gateway.gw_settings_concurrency_hint")}
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">{t("gateway.gw_settings_timeout")}</label>
          <input className="input" type="number" min={1000} max={600000}
            {...register("timeout_ms", { valueAsNumber: true, required: true })} />
          <p className="text-xs text-slate-500 mt-1">
            {t("gateway.gw_settings_timeout_hint")}
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? t("gateway.gw_settings_saving") : t("gateway.gw_settings_submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
