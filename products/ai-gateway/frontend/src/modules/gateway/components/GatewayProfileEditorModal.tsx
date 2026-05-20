import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/Toast";
import type { Category } from "../configs/providerVisuals";
import { profilesService } from "../services/profiles.service";
import type { Profile } from "../models/profile";
import type { ProxyRef } from "../models/proxy";
import { extractError } from "../utils/common";

export function GatewayProfileEditorModal({
  profile, isCreate, proxies, onClose,
}: {
  profile: Profile | null;
  isCreate: boolean;
  proxies: ProxyRef[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: profile?.name ?? "",
      category: (profile?.category ?? "grok") as Category,
      description: profile?.description ?? "",
      is_active: profile?.is_active ?? true,
      proxy_id: profile?.proxy_id ?? "",
      concurrency_limit: profile?.concurrency_limit ?? 1,
      tags: (profile?.tags ?? []).join(", "),
      user_agent: profile?.antidetect?.user_agent ?? "",
      locale: profile?.antidetect?.locale ?? "en-US",
      timezone_id: profile?.antidetect?.timezone_id ?? "UTC",
      color_scheme: profile?.antidetect?.color_scheme ?? "dark",
      viewport_width: profile?.antidetect?.viewport_width ?? 1440,
      viewport_height: profile?.antidetect?.viewport_height ?? 900,
      platform: profile?.antidetect?.platform ?? "Win32",
      hardware_concurrency: profile?.antidetect?.hardware_concurrency ?? 8,
    },
  });

  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        category: v.category,
        description: v.description || null,
        is_active: v.is_active,
        proxy_id: v.proxy_id || null,
        concurrency_limit: Number(v.concurrency_limit),
        tags: v.tags ? v.tags.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        antidetect: {
          user_agent: v.user_agent || null,
          locale: v.locale || null,
          timezone_id: v.timezone_id || null,
          color_scheme: v.color_scheme || null,
          viewport_width: Number(v.viewport_width),
          viewport_height: Number(v.viewport_height),
          platform: v.platform || null,
          hardware_concurrency: Number(v.hardware_concurrency),
        },
      };
      return isCreate
        ? profilesService.create(payload)
        : profilesService.update(profile!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-profiles"] });
      toast(isCreate ? t("gateway.profile_editor_created") : t("gateway.profile_editor_saved"), "success");
      onClose();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        className="w-full max-w-2xl max-h-[95vh] overflow-auto rounded-lg bg-white p-5 shadow-xl space-y-3"
      >
        <h2 className="text-lg font-semibold">
          {isCreate ? t("gateway.profile_editor_create_title") : `${t("gateway.profile_editor_edit_title")}: ${profile?.name}`}
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">{t("gateway.profile_editor_name")}</label>
            <input className="input" {...register("name", { required: true })} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.profile_editor_category")}</label>
            <select className="input" {...register("category")} disabled={!isCreate}>
              <option value="grok">Grok</option>
              <option value="flow">Flow</option>
              <option value="dreamina">Dreamina</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.profile_editor_proxy")}</label>
            <select className="input" {...register("proxy_id")}>
              <option value="">{t("gateway.profile_editor_no_proxy")}</option>
              {proxies.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.profile_editor_concurrency_limit")}</label>
            <input className="input" type="number" min={1}
              {...register("concurrency_limit", { valueAsNumber: true })} />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">{t("gateway.profile_editor_description")}</label>
            <input className="input" {...register("description")} />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">{t("gateway.profile_editor_tags")}</label>
            <input className="input" {...register("tags")} placeholder="prod, vn" />
          </div>
        </div>

        <details className="border-t pt-3">
          <summary className="text-sm font-semibold cursor-pointer text-slate-700">
            {t("gateway.profile_editor_antidetect")}
          </summary>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="col-span-2">
              <label className="text-sm font-medium">{t("gateway.profile_editor_user_agent")}</label>
              <input className="input font-mono text-xs" {...register("user_agent")} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("gateway.profile_editor_locale")}</label>
              <input className="input" {...register("locale")} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("gateway.profile_editor_timezone")}</label>
              <input className="input" {...register("timezone_id")} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("gateway.profile_editor_color_scheme")}</label>
              <select className="input" {...register("color_scheme")}>
                <option value="dark">dark</option>
                <option value="light">light</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("gateway.profile_editor_platform")}</label>
              <input className="input" {...register("platform")} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("gateway.profile_editor_viewport_width")}</label>
              <input className="input" type="number"
                {...register("viewport_width", { valueAsNumber: true })} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("gateway.profile_editor_viewport_height")}</label>
              <input className="input" type="number"
                {...register("viewport_height", { valueAsNumber: true })} />
            </div>
            <div>
              <label className="text-sm font-medium">{t("gateway.profile_editor_hardware_concurrency")}</label>
              <input className="input" type="number"
                {...register("hardware_concurrency", { valueAsNumber: true })} />
            </div>
          </div>
        </details>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("is_active")} />
          <span>{t("gateway.profile_editor_active")}</span>
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button type="button" onClick={onClose} className="btn-ghost">{t("gateway.profile_editor_cancel")}</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? t("gateway.profile_editor_saving") : isCreate ? t("gateway.profile_editor_create") : t("gateway.profile_editor_save")}
          </button>
        </div>
      </form>
    </div>
  );
}
