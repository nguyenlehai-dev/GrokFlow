import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { Image as ImageIcon, Lock, X } from "lucide-react";
import { api } from "@/core/api/axios";
import { useFeature } from "@/core/auth/store";
import { FEATURE_KEYS } from "@/core/entitlements/catalog";
import { toast } from "@/components/ui/Toast";

interface Profile {
  id: string;
  name: string;
  provider: string;
  status: string;
  active_jobs: number;
  max_concurrent_jobs: number;
}

interface Form {
  provider: "grok" | "flow";
  job_type: "image" | "video";
  profile_id: string;
  prompt: string;
  size: string;
  model: string;
  style: string;
  n: number;
  seed: number | null;
  // Shared
  aspect: string;
  // Image-only
  quality: "speed" | "quality";
  // Video-only — Grok video toggles match the live UI exactly:
  //   Resolution: 480p | 720p
  //   Duration:   6s   | 10s
  resolution: "480p" | "720p";
  duration: number;
  mode: "normal" | "fun" | "custom" | "spicy";
}

const ASPECTS = [
  { v: "1:1",  label: "1:1 Square" },
  { v: "16:9", label: "16:9 Landscape" },
  { v: "9:16", label: "9:16 Portrait" },
  { v: "4:3",  label: "4:3" },
  { v: "3:4",  label: "3:4" },
  { v: "3:2",  label: "3:2" },
  { v: "2:3",  label: "2:3" },
];

const SIZES_FROM_ASPECT: Record<string, string> = {
  "1:1":  "1024x1024",
  "16:9": "1024x576",
  "9:16": "576x1024",
  "4:3":  "1024x768",
  "3:4":  "768x1024",
  "3:2":  "1080x720",
  "2:3":  "720x1080",
};

// Grok web UI doesn't expose model / style / variant-count / seed pickers.
// Form schema still includes those fields so the existing Pydantic
// JobCreate payload validates, but they're hidden from the UI to match
// Grok's actual prompt bar.
// Grok Imagine video — durations match the LIVE UI exactly: 6s | 10s.
const VIDEO_DURATIONS = [6, 10];
const VIDEO_RESOLUTIONS = ["480p", "720p"] as const;

// Grok video presets shown after the first generation. "spicy" is NSFW and
// gated on most account tiers — provider will fall back to "normal" if the
// preset button is unavailable.
const VIDEO_MODES = [
  { v: "normal", label: "Normal (mặc định)" },
  { v: "fun",    label: "Fun (thiên về hài, cường điệu)" },
  { v: "custom", label: "Custom (dùng prompt nguyên văn)" },
  { v: "spicy",  label: "Spicy (18+) — cần Pro/Heavy" },
];

export function CreateJobModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [inputImage, setInputImage] = useState<{ file_id: string; preview: string } | null>(null);

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
    queryFn: async () => (await api.get<Profile[]>("/api/profiles")).data,
  });

  const { register, handleSubmit, watch, control, setValue, formState: { isSubmitting } } = useForm<Form>({
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

  const uploadInput = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      // Important: do NOT set Content-Type — letting axios/browser auto-add the
      // multipart boundary header. Setting it manually breaks FastAPI's
      // multipart parser (no boundary token → 422).
      const r = await api.post<{ file_id: string; file_name: string }>(
        "/api/jobs/upload-input", fd,
      );
      return { file_id: r.data.file_id, preview: URL.createObjectURL(file) };
    },
    onSuccess: (v) => { setInputImage(v); toast("Đã upload ảnh tham chiếu", "success"); },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail?.message ?? e?.message ?? "Upload ảnh lỗi";
      toast(msg, "error");
    },
  });

  const onSubmit = async (v: Form) => {
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
      await api.post("/api/jobs", payload);
    } catch (e: any) {
      const msg = e?.response?.data?.detail?.message ?? e?.message ?? "Tạo job lỗi";
      toast(msg, "error");
      return;
    }
    qc.invalidateQueries({ queryKey: ["jobs"] });
    toast("Job đã được đưa vào hàng đợi", "success");
    onClose();
  };

  // A profile can accept a job whenever it's "ready" (logged in or already
  // running another job). Even if all slots are currently occupied the
  // backend will queue the new job — concurrency is a runtime gate, not a
  // queue-admission gate.
  const profileSelectable = (p: Profile) =>
    p.status === "logged_in" || p.status === "running_job";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm p-4 animate-fade-in">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-3xl rounded-2xl bg-ink-900 p-6 shadow-card-hover space-y-4 max-h-[95vh] overflow-auto animate-scale-in border border-ink-200/60"
      >
        <div className="flex items-center justify-between pb-3 border-b border-ink-100">
          <div>
            <h2 className="text-xl font-bold text-ink-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-gradient-brand text-white flex items-center justify-center">
                <ImageIcon size={16} />
              </span>
              Tạo Job mới
            </h2>
            <p className="text-xs text-ink-500 mt-1">Cấu hình giống Grok Imagine UI</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-ink-400 hover:text-ink-900 hover:bg-ink-100 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium">Provider</label>
            <select className="input" {...register("provider")}>
              <option value="grok">Grok</option>
              <option value="flow">Flow (video)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Type</label>
            <select className="input" {...register("job_type")} disabled={provider === "flow"}>
              <option value="image" disabled={!canImage}>Image{!canImage ? " 🔒" : ""}</option>
              <option value="video" disabled={!canVideo}>Video{!canVideo ? " 🔒" : ""}</option>
            </select>
            {provider === "grok" && jobType === "video" && (
              <p className="text-xs text-amber-600 mt-1">Cần Grok account có quyền video</p>
            )}
            {!canImage && !canVideo && (
              <p className="text-xs text-rose-600 mt-1">
                <Lock size={12} className="inline" /> Gói hiện tại chưa được bật tạo job
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">Profile</label>
            <Controller
              control={control}
              name="profile_id"
              render={({ field }) => (
                <select className="input" {...field}>
                  <option value="">— Auto pick (least-loaded) —</option>
                  {eligibleProfiles.map((p) => {
                    const selectable = profileSelectable(p);
                    const slots = `${p.active_jobs}/${p.max_concurrent_jobs}`;
                    const full = p.active_jobs >= p.max_concurrent_jobs;
                    const note = !selectable
                      ? ` — ${p.status}`
                      : full
                        ? " — full, sẽ queue"
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
              <p className="text-xs text-amber-600 mt-1">Chưa có profile {provider}. Tạo profile + Auto login trước.</p>
            )}
            {eligibleProfiles.length > 0 && eligibleProfiles.every((p) => !profileSelectable(p)) && (
              <p className="text-xs text-rose-600 mt-1">Profile {provider} chưa logged_in. Admin cần Auto-login.</p>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Prompt</label>
          <textarea
            className="input min-h-[100px]"
            placeholder="Mô tả ảnh hoặc video bạn muốn tạo..."
            {...register("prompt", { required: true, maxLength: 4000 })}
          />
        </div>

        {(jobType === "image" || (provider === "grok" && jobType === "video")) && (
          (jobType === "image" ? canImg2Img : canImg2Vid) ? (
          <div>
            <label className="text-sm font-medium">
              Ảnh tham chiếu (optional) — quyết định mode:
            </label>
            <p className="text-xs text-ink-300 mt-1">
              {jobType === "image" ? (
                <>
                  • Không upload → <strong>prompt → image</strong> (text-to-image)<br />
                  • Có upload → <strong>image + prompt → image</strong> (Grok dùng ảnh làm style/composition reference, generate ảnh mới)
                </>
              ) : (
                <>
                  • Không upload → <strong>prompt → video</strong> (text-to-video)<br />
                  • Có upload → <strong>image → video</strong> (Grok animate ảnh upload theo prompt)
                </>
              )}
            </p>
            <div className="flex items-center gap-3 mt-1">
              {inputImage ? (
                <div className="relative">
                  <img src={inputImage.preview} className="w-24 h-24 object-cover rounded border" />
                  <button type="button" onClick={() => setInputImage(null)}
                    className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-0.5">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-24 h-24 border-2 border-dashed border-ink-700 rounded flex flex-col items-center justify-center text-ink-500 hover:border-brand-500 hover:text-brand-500">
                  <ImageIcon size={24} />
                  <span className="text-xs mt-1">{uploadInput.isPending ? "..." : "Upload"}</span>
                </button>
              )}
              <input
                type="file" accept="image/*" ref={fileRef} className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadInput.mutate(f); }}
              />
            </div>
          </div>
          ) : (
            <p className="text-xs text-ink-400 italic">
              <Lock size={12} className="inline" /> Gói hiện tại không hỗ trợ upload ảnh tham chiếu cho {jobType}.
            </p>
          )
        )}

        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-sm font-medium">Khung hình (aspect)</label>
            <select className="input" {...register("aspect")}>
              {ASPECTS.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
            </select>
          </div>

          {/* Image-only: Speed / Quality (matches Grok's prompt bar in Image mode) */}
          {jobType === "image" && (
            <div>
              <label className="text-sm font-medium">Chất lượng</label>
              <select className="input" {...register("quality")}>
                <option value="speed">Speed (nhanh)</option>
                <option value="quality" disabled={!canQualityHigh}>
                  Quality (chậm, đẹp hơn){!canQualityHigh ? " 🔒" : ""}
                </option>
              </select>
            </div>
          )}

          {/* Video-only: Resolution 480p|720p (matches Grok's live UI) */}
          {jobType === "video" && (
            <div>
              <label className="text-sm font-medium">Độ phân giải</label>
              <select className="input" {...register("resolution")}>
                {VIDEO_RESOLUTIONS.map((r) => {
                  const locked = r === "720p" && !can720p;
                  return (
                    <option key={r} value={r} disabled={locked}>
                      {r}{locked ? " 🔒" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Video-only: Duration 6s|10s */}
          {jobType === "video" && (
            <div>
              <label className="text-sm font-medium">Thời lượng</label>
              <select className="input" {...register("duration", { valueAsNumber: true })}>
                {VIDEO_DURATIONS.map((d) => {
                  const locked = d === 10 && !can10s;
                  return (
                    <option key={d} value={d} disabled={locked}>
                      {d}s{locked ? " 🔒" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

        </div>

        {jobType === "video" && (
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-sm font-medium">Mode video (preset hậu kỳ)</label>
              <select className="input" {...register("mode")}>
                {VIDEO_MODES.map((m) => {
                  const locked =
                    (m.v === "spicy"  && !canSpicy) ||
                    (m.v === "fun"    && !canFun) ||
                    (m.v === "custom" && !canCustom);
                  return (
                    <option key={m.v} value={m.v} disabled={locked}>
                      {m.label}{locked ? " 🔒" : ""}
                    </option>
                  );
                })}
              </select>
              <p className="text-xs text-ink-400 mt-1">
                Sau khi Grok render video, hệ thống tự click preset bạn chọn để regenerate phiên bản đó.
                {canSpicy && (
                  <> <strong> Spicy (18+)</strong> chỉ có với account Pro/Heavy.</>
                )}
              </p>
            </div>
          </div>
        )}

        <p className="text-xs text-ink-400">
          Grok luôn render <strong>4 variants</strong> mỗi job — sẽ hiện đủ trong gallery sau khi xong.
        </p>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Đang gửi..." : "Tạo job"}
          </button>
        </div>
      </form>
    </div>
  );
}
