import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Image as ImageIcon, Lock, X } from "lucide-react";
import { useFeature } from "@/core/auth/store";
import { FEATURE_KEYS } from "@/core/entitlements/catalog";
import { toast } from "@/components/ui/Toast";
import type { Profile } from "../models/profile";
import { jobsService } from "../services/jobs.service";
import { profilesService } from "../services/profiles.service";
import { ASPECT_OPTIONS, SIZES_FROM_ASPECT } from "../configs/aspects";
import type { CreateJobForm } from "./CreateJobForm.types";
import { CreateJobReferenceImagePicker, type InputImage } from "./CreateJobReferenceImagePicker";
import { CreateJobImageFields } from "./CreateJobImageFields";
import {
  CreateJobVideoResolutionAndDuration,
  CreateJobVideoModeField,
} from "./CreateJobVideoFields";

// Grok web UI doesn't expose model / style / variant-count / seed pickers.
// Form schema still includes those fields so the existing Pydantic
// JobCreate payload validates, but they're hidden from the UI to match
// Grok's actual prompt bar.

export function CreateJobModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [inputImage, setInputImage] = useState<InputImage | null>(null);

  // Entitlements — gate UI options to what the user's plan allows.
  const canImage = useFeature(FEATURE_KEYS.jobImage);
  const canVideo = useFeature(FEATURE_KEYS.jobVideo);
  const canImg2Img = useFeature(FEATURE_KEYS.jobImageToImage);
  const canImg2Vid = useFeature(FEATURE_KEYS.jobImageToVideo);
  const canQualityHigh = useFeature(FEATURE_KEYS.imageQualityHigh);
  const can720p = useFeature(FEATURE_KEYS.videoResolution720p);
  const can10s = useFeature(FEATURE_KEYS.videoDuration10s);
  const canSpicy = useFeature(FEATURE_KEYS.videoSpicy);
  const canFun = useFeature(FEATURE_KEYS.videoFunMode);
  const canCustom = useFeature(FEATURE_KEYS.videoCustomMode);

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => profilesService.list(),
  });

  const { register, handleSubmit, watch, control, setValue, formState: { isSubmitting } } = useForm<CreateJobForm>({
    defaultValues: {
      provider: "grok", job_type: "image", profile_id: "",
      size: "1024x1024", aspect: "1:1",
      quality: "speed",                  // image-only
      resolution: "720p", duration: 6,   // video-only
      mode: "normal", model: "aurora", style: "natural", n: 1, seed: null,
    },
  });
  const provider = watch("provider");
  const jobType = watch("job_type");
  const aspect = watch("aspect");

  useEffect(() => {
    if (provider === "flow") setValue("job_type", "video");
    setValue("model", provider === "grok" ? "aurora" : "veo-3");
  }, [provider, setValue]);

  // Default the form to whichever job_type the user actually has access to.
  useEffect(() => {
    if (jobType === "image" && !canImage && canVideo) setValue("job_type", "video");
    if (jobType === "video" && !canVideo && canImage) setValue("job_type", "image");
  }, [canImage, canVideo, jobType, setValue]);

  // Drop ineligible defaults so the form doesn't submit a blocked option.
  useEffect(() => {
    if (!canQualityHigh) setValue("quality", "speed");
    if (!can720p) setValue("resolution", "480p");
    if (!can10s) setValue("duration", 6);
  }, [canQualityHigh, can720p, can10s, setValue]);

  // Keep `size` in sync with `aspect` (size is what backend currently uses;
  // aspect is what we display + pass through as a hint).
  useEffect(() => {
    if (aspect && SIZES_FROM_ASPECT[aspect]) {
      setValue("size", SIZES_FROM_ASPECT[aspect]);
    }
  }, [aspect, setValue]);

  const eligibleProfiles = (profiles ?? []).filter((p) => p.provider === provider);

  const onSubmit = async (v: CreateJobForm) => {
    const payload: any = {
      provider: v.provider, job_type: v.job_type, prompt: v.prompt,
      size: v.size, model: v.model, style: v.style, n: Number(v.n),
      // Pass aspect/quality/duration through `options` JSONB so provider
      // can consume them. Backend's create_job merges these into options.
      options: {
        aspect: v.aspect,
        // Match Grok's actual prompt-bar controls:
        //   image → Speed | Quality (no resolution/duration)
        //   video → 480p | 720p, 6s | 10s (no Speed/Quality)
        ...(v.job_type === "image"
          ? { quality: v.quality }
          : {
              resolution: v.resolution,
              duration: Number(v.duration),
              mode: v.mode,
            }),
      },
    };
    if (v.profile_id) payload.profile_id = v.profile_id;
    if (v.seed != null && Number(v.seed) > 0) payload.seed = Number(v.seed);
    if (inputImage) payload.input_image_file_id = inputImage.file_id;
    try {
      await jobsService.create(payload);
    } catch (e: any) {
      const msg = e?.response?.data?.detail?.message ?? e?.message ?? t("grok.create_job_error");
      toast(msg, "error");
      return;
    }
    qc.invalidateQueries({ queryKey: ["jobs"] });
    toast(t("grok.create_job_queued"), "success");
    onClose();
  };

  // A profile can accept a job whenever it's "ready" (logged in or already
  // running another job). Even if all slots are currently occupied the
  // backend will queue the new job — concurrency is a runtime gate, not a
  // queue-admission gate.
  const profileSelectable = (p: Profile) =>
    p.status === "logged_in" || p.status === "running_job";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm p-4 animate-fade-in">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-card-hover space-y-4 max-h-[95vh] overflow-auto animate-scale-in border border-slate-200/60"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-gradient-brand text-white flex items-center justify-center">
                <ImageIcon size={16} />
              </span>
              {t("grok.create_job_title")}
            </h2>
            <p className="text-xs text-slate-400 mt-1">{t("grok.create_job_subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium">{t("grok.create_job_provider")}</label>
            <select className="input" {...register("provider")}>
              <option value="grok">Grok</option>
              <option value="flow">{t("grok.create_job_provider_flow")}</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">{t("grok.create_job_type")}</label>
            <select className="input" {...register("job_type")} disabled={provider === "flow"}>
              <option value="image" disabled={!canImage}>{t("grok.create_job_type_image")}{!canImage ? " 🔒" : ""}</option>
              <option value="video" disabled={!canVideo}>{t("grok.create_job_type_video")}{!canVideo ? " 🔒" : ""}</option>
            </select>
            {provider === "grok" && jobType === "video" && (
              <p className="text-xs text-amber-600 mt-1">{t("grok.create_job_need_video_perm")}</p>
            )}
            {!canImage && !canVideo && (
              <p className="text-xs text-rose-600 mt-1">
                <Lock size={12} className="inline" /> {t("grok.create_job_plan_no_create")}
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">{t("grok.create_job_profile")}</label>
            <Controller
              control={control}
              name="profile_id"
              render={({ field }) => (
                <select className="input" {...field}>
                  <option value="">{t("grok.create_job_auto_pick")}</option>
                  {eligibleProfiles.map((p) => {
                    const selectable = profileSelectable(p);
                    const slots = `${p.active_jobs}/${p.max_concurrent_jobs}`;
                    const full = p.active_jobs >= p.max_concurrent_jobs;
                    const note = !selectable
                      ? ` — ${p.status}`
                      : full
                        ? ` — ${t("grok.create_job_full_will_queue")}`
                        : "";
                    return (
                      <option key={p.id} value={p.id} disabled={!selectable}>
                        {p.name} [{slots}{note}]
                      </option>
                    );
                  })}
                </select>
              )}
            />
            {eligibleProfiles.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">{t("grok.create_job_no_profile", { provider })}</p>
            )}
            {eligibleProfiles.length > 0 && eligibleProfiles.every((p) => !profileSelectable(p)) && (
              <p className="text-xs text-rose-600 mt-1">{t("grok.create_job_profile_not_logged_in", { provider })}</p>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">{t("grok.create_job_prompt")}</label>
          <textarea
            className="input min-h-[100px]"
            placeholder={t("grok.create_job_prompt_placeholder")}
            {...register("prompt", { required: true, maxLength: 4000 })}
          />
        </div>

        {(jobType === "image" || (provider === "grok" && jobType === "video")) && (
          <CreateJobReferenceImagePicker
            jobType={jobType}
            allowed={jobType === "image" ? canImg2Img : canImg2Vid}
            value={inputImage}
            onChange={setInputImage}
          />
        )}

        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-sm font-medium">{t("grok.create_job_aspect")}</label>
            <select className="input" {...register("aspect")}>
              {ASPECT_OPTIONS.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
            </select>
          </div>

          {/* Image-only: Speed / Quality (matches Grok's prompt bar in Image mode) */}
          {jobType === "image" && (
            <CreateJobImageFields register={register} canQualityHigh={canQualityHigh} />
          )}

          {/* Video-only: Resolution 480p|720p + Duration 6s|10s */}
          {jobType === "video" && (
            <CreateJobVideoResolutionAndDuration
              register={register}
              can720p={can720p}
              can10s={can10s}
            />
          )}

        </div>

        {jobType === "video" && (
          <CreateJobVideoModeField
            register={register}
            canSpicy={canSpicy}
            canFun={canFun}
            canCustom={canCustom}
          />
        )}

        <p className="text-xs text-slate-500">
          {t("grok.create_job_variants_note_prefix")} <strong>{t("grok.create_job_variants_note_strong")}</strong> {t("grok.create_job_variants_note_suffix")}
        </p>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <button type="button" onClick={onClose} className="btn-ghost">{t("grok.create_job_cancel")}</button>
          <button className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? t("grok.create_job_submitting") : t("grok.create_job_submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
