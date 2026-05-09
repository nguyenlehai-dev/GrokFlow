import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { Image as ImageIcon, X } from "lucide-react";
import { api } from "@/core/api/axios";
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
  // Video-only
  aspect: string;
  quality: "speed" | "quality";
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

const GROK_MODELS = ["aurora", "grok-2-image", "grok-3-image"];
const FLOW_MODELS = ["veo-3", "veo-2"];
const STYLES = ["natural", "vivid", "anime", "photographic"];
// Grok Imagine video durations (free=6s, Pro=15s; we offer both — provider
// will pick what the account allows).
const VIDEO_DURATIONS = [3, 6, 9, 15];

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

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await api.get<Profile[]>("/api/profiles")).data,
  });

  const { register, handleSubmit, watch, control, setValue, formState: { isSubmitting } } = useForm<Form>({
    defaultValues: {
      provider: "grok", job_type: "image", profile_id: "",
      size: "1024x1024", aspect: "1:1", quality: "speed", duration: 6,
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
        quality: v.quality,
        ...(v.job_type === "video"
          ? { duration: Number(v.duration), mode: v.mode }
          : {}),
      },
    };
    if (v.profile_id) payload.profile_id = v.profile_id;
    if (v.seed != null && Number(v.seed) > 0) payload.seed = Number(v.seed);
    if (inputImage) payload.input_image_file_id = inputImage.file_id;
    await api.post("/api/jobs", payload);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-3xl rounded-lg bg-white p-6 shadow-xl space-y-4 max-h-[95vh] overflow-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tạo Job mới (giống Grok)</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
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
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
            {provider === "grok" && jobType === "video" && (
              <p className="text-xs text-amber-600 mt-1">Cần Grok account có quyền video</p>
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
          <div>
            <label className="text-sm font-medium">
              Ảnh tham chiếu ({jobType === "video" ? "image-to-video" : "image-to-image"}, optional)
            </label>
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
                  className="w-24 h-24 border-2 border-dashed border-slate-300 rounded flex flex-col items-center justify-center text-slate-400 hover:border-brand-500 hover:text-brand-500">
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
        )}

        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-sm font-medium">Khung hình (aspect)</label>
            <select className="input" {...register("aspect")}>
              {ASPECTS.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Chất lượng</label>
            <select className="input" {...register("quality")}>
              <option value="speed">Speed (nhanh)</option>
              <option value="quality">Quality (chậm, đẹp hơn)</option>
            </select>
          </div>
          {jobType === "video" ? (
            <div>
              <label className="text-sm font-medium">Số giây</label>
              <select className="input" {...register("duration", { valueAsNumber: true })}>
                {VIDEO_DURATIONS.map((d) => (
                  <option key={d} value={d}>{d}s {d === 6 ? "(free)" : d === 15 ? "(Pro)" : ""}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium">Style</label>
              <select className="input" {...register("style")}>
                {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Model</label>
            <select className="input" {...register("model")}>
              {(provider === "grok" ? GROK_MODELS : FLOW_MODELS).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {jobType === "video" && (
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-sm font-medium">Mode video (preset hậu kỳ)</label>
              <select className="input" {...register("mode")}>
                {VIDEO_MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Sau khi Grok render video, hệ thống tự click preset bạn chọn để regenerate phiên bản đó.
                <strong> Spicy (18+)</strong> chỉ có với account Pro/Heavy — nếu account thiếu quyền sẽ tự động fallback về Normal.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Số biến thể (n)</label>
            <input type="number" className="input" min={1} max={4} {...register("n", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="text-sm font-medium">Seed (optional, để 0 = random)</label>
            <input type="number" className="input" placeholder="0" {...register("seed", { valueAsNumber: true })} />
          </div>
        </div>

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
