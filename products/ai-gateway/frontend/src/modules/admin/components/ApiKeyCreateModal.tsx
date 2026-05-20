import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { apiKeysService } from "../services/apiKeys.service";
import { ApiKeyModalShell } from "./ApiKeyModalShell";

interface CreateValues {
  name: string;
  providers: { grok: boolean; flow: boolean };
  jobTypes: { image: boolean; video: boolean };
  daily_limit: number;
  rate_limit_per_minute: number;
}

export function ApiKeyCreateModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (v: { name: string; api_key: string }) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<CreateValues>({
    defaultValues: {
      providers: { grok: true, flow: false },
      jobTypes: { image: true, video: true },
      daily_limit: 1000,
      rate_limit_per_minute: 60,
    },
  });

  const onSubmit = async (v: CreateValues) => {
    const allowed_providers = Object.entries(v.providers).filter(([, on]) => on).map(([k]) => k);
    const allowed_job_types = Object.entries(v.jobTypes).filter(([, on]) => on).map(([k]) => k);
    const data = await apiKeysService.create({
      name: v.name,
      allowed_providers,
      allowed_job_types,
      daily_limit: Number(v.daily_limit),
      rate_limit_per_minute: Number(v.rate_limit_per_minute),
    });
    qc.invalidateQueries({ queryKey: ["api-keys"] });
    onCreated({ name: data.name, api_key: data.api_key });
  };

  return (
    <ApiKeyModalShell title={t("admin.apikey_create_title")} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="text-sm font-medium">{t("admin.apikey_create_name")}</label>
          <input className="input" {...register("name", { required: true })} placeholder={t("admin.apikey_create_name_ph")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{t("admin.apikey_create_providers")}</legend>
            <label className="flex gap-2 text-sm"><input type="checkbox" {...register("providers.grok")} /> grok</label>
            <label className="flex gap-2 text-sm"><input type="checkbox" {...register("providers.flow")} /> flow</label>
          </fieldset>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{t("admin.apikey_create_job_types")}</legend>
            <label className="flex gap-2 text-sm"><input type="checkbox" {...register("jobTypes.image")} /> image</label>
            <label className="flex gap-2 text-sm"><input type="checkbox" {...register("jobTypes.video")} /> video</label>
          </fieldset>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">{t("admin.apikey_create_daily_limit")}</label>
            <input className="input" type="number" min={1} {...register("daily_limit", { required: true, min: 1 })} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("admin.apikey_create_rate_per_min")}</label>
            <input className="input" type="number" min={1} {...register("rate_limit_per_minute", { required: true, min: 1 })} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">{t("admin.apikey_create_cancel")}</button>
          <button className="btn-primary" disabled={isSubmitting}>{t("admin.apikey_create_submit")}</button>
        </div>
      </form>
    </ApiKeyModalShell>
  );
}
