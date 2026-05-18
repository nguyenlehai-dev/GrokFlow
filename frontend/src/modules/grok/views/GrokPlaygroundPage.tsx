import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Activity, RefreshCw, KeyRound, X, Loader2, ChevronRight,
  Type, ImagePlus, Film, ImageIcon, Upload, Check,
} from "lucide-react";

import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import { toast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useGrokKey } from "../stores/grokKeyStore";
import { GrokKeyLockModal } from "../components/GrokKeyLockModal";
import type { JobOut } from "../models/job";
import { jobsService } from "../services/jobs.service";
import { PLAYGROUND_ASPECTS, QUALITIES } from "../configs/aspects";
import { aspectToSize } from "../utils/aspect";

/** Grok Playground — verified-key gated UI for submitting jobs as if
 *  from an external integration. Admin bypasses the lock; everyone else
 *  must verify an API key first.
 *
 *  Submitted jobs use the verified key as Bearer (not the user's JWT)
 *  so they land under the key's owner. That matches the external API
 *  surface 1:1 — what you do here is the same call third-party code
 *  would make against /api/jobs.
 */

export function GrokPlaygroundPage() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const verified = useGrokKey((s) => s.current);
  const clear = useGrokKey((s) => s.clear);
  const domainConfig = useDomainStore((s) => s.config);
  // Only super_admin bypasses the API-key gate — domain admins are
  // tenants and go through the same auth path as third-party callers.
  // Domain-level toggle on `/admin/domains` can disable the gate.
  const isSuper = me?.role === "super_admin";
  const gateRequired = domainConfig?.require_playground_key ?? true;
  const locked = gateRequired && !isSuper && !verified;

  return (
    <div className="relative space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Activity size={22} className="text-violet-600" /> {t("grok.playground_title")}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("grok.playground_subtitle")}
          </p>
        </div>
        {verified && (
          <KeyStatusChip
            label={verified.label}
            usedToday={verified.used_today}
            dailyLimit={verified.daily_limit}
            onClear={() => {
              clear();
              toast(t("grok.playground_key_cleared"), "info");
            }}
          />
        )}
      </header>

      {locked && <GrokKeyLockModal />}

      <PlaygroundForm bearer={verified?.key ?? null} isAdmin={isSuper} />
    </div>
  );
}

function KeyStatusChip({
  label, usedToday, dailyLimit, onClear,
}: {
  label: string;
  usedToday: number | null;
  dailyLimit: number | null;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const pct = usedToday != null && dailyLimit != null && dailyLimit > 0
    ? Math.round((usedToday / dailyLimit) * 100)
    : null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs">
      <KeyRound size={12} className="text-violet-600" />
      <span className="font-mono text-violet-700">{label || t("grok.playground_no_label")}</span>
      {usedToday != null && dailyLimit != null && (
        <span className="text-violet-600">
          {usedToday}/{dailyLimit}
          {pct != null && pct >= 80 && (
            <span className="ml-1 text-rose-600 font-semibold">!</span>
          )}
        </span>
      )}
      <button
        type="button"
        onClick={onClear}
        className="text-violet-400 hover:text-rose-600"
        title={t("grok.playground_change_key")}
      >
        <X size={12} />
      </button>
    </div>
  );
}

/** 4 generation modes — each maps to a (job_type, needs_image) tuple.
 *
 *  t2i — text → image                (job_type=image, no attachment)
 *  i2i — image + text → image        (job_type=image, attachment)
 *  t2v — text → video                (job_type=video, no attachment)
 *  i2v — image + text → video        (job_type=video, attachment)
 *
 *  Backend path: all 4 go through the same Playwright "Imagine studio"
 *  flow. `job.attachments` (resolved from `input_image_file_id`) gates
 *  whether the worker calls `_attach_files()` before submitting. */
const MODES = [
  { key: "t2i", label: "Text → Image",        jobType: "image" as const, needsImage: false, icon: Type },
  { key: "i2i", label: "Image + Text → Image", jobType: "image" as const, needsImage: true,  icon: ImagePlus },
  { key: "t2v", label: "Text → Video",        jobType: "video" as const, needsImage: false, icon: Film },
  { key: "i2v", label: "Image + Text → Video", jobType: "video" as const, needsImage: true,  icon: ImageIcon },
] as const;
type ModeKey = typeof MODES[number]["key"];

function PlaygroundForm({ bearer, isAdmin }: { bearer: string | null; isAdmin: boolean }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ModeKey>("t2i");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("1:1");
  const [quality, setQuality] = useState("speed");
  const [resolution, setResolution] = useState<"480p" | "720p">("480p");
  const [duration, setDuration] = useState(6);
  const [inputImage, setInputImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  // file_id returned by upload-input AFTER Grok moderation passed. If
  // null while inputImage is set, we're either still uploading or upload
  // failed → submit stays disabled until this becomes truthy.
  const [inputFileId, setInputFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<JobOut | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const modeMeta = MODES.find((m) => m.key === mode)!;
  const jobType = modeMeta.jobType;
  const needsImage = modeMeta.needsImage;

  // Pick + upload + validate in one shot. Grok's content moderation
  // runs inside the backend upload endpoint, so a bad image throws here
  // with a 400 and never reaches the job-submit step. The user sees
  // feedback at file-pick time, not 3 minutes after clicking Submit.
  const pickFile = async (file: File | null) => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (!file) {
      setInputImage(null);
      setImagePreview(null);
      setInputFileId(null);
      return;
    }
    // Show preview immediately for UX, even before upload completes.
    setInputImage(file);
    setImagePreview(URL.createObjectURL(file));
    setInputFileId(null);
    setUploading(true);
    try {
      const up = await jobsService.uploadInput(file);
      setInputFileId(up.file_id);
      toast("Ảnh đã được Grok chấp nhận", "success");
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === "string"
        ? detail
        : detail?.message ?? e?.message ?? "Upload ảnh lỗi";
      toast(msg, "error");
      // Clear the picked image so user knows to pick another.
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setInputImage(null);
      setImagePreview(null);
    } finally {
      setUploading(false);
    }
  };

  // For admin without a Bearer (no key needed when isAdmin), we fall back
  // to the regular axios instance (JWT-authed). For non-admin verified
  // users we build a one-off axios instance with their Bearer key so the
  // job lands under the key's owner.
  const submit = useMutation({
    mutationFn: async () => {
      // Reference image was already uploaded + moderation-checked at
      // pick time → `inputFileId` is the file_id returned by that
      // upload. Submit just references it; no second upload here.
      let inputImageFileId: string | null = null;
      if (needsImage) {
        if (!inputFileId) throw new Error("Chưa có ảnh hợp lệ — upload trước");
        inputImageFileId = inputFileId;
      }
      const body: Record<string, unknown> = {
        provider: "grok",
        job_type: jobType,
        prompt,
        profile_id: null,
        options: jobType === "image"
          ? { aspect, size: aspectToSize(aspect), n: 1, quality }
          : { aspect, resolution, duration, n: 1 },
      };
      if (inputImageFileId) body.input_image_file_id = inputImageFileId;
      if (bearer && !isAdmin) {
        return jobsService.submitWithKey(bearer, body);
      }
      // Admin path or unauthenticated bearer-less request — use main axios.
      return jobsService.submit(body);
    },
    onSuccess: (data) => {
      setResult(data);
      toast(t("grok.playground_submit_success"), "success");
    },
    onError: (e: any) => {
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : detail?.message || e?.message || t("grok.playground_submit_failed");
      toast(msg, "error");
    },
  });

  return (
    <>
      <div className="card space-y-4 p-4">
        <h2 className="font-semibold">{t("grok.playground_submit_job")}</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setMode(m.key);
                  // Clear staged image when switching to a text-only mode so
                  // the preview thumbnail doesn't linger confusingly.
                  if (!m.needsImage && inputImage) pickFile(null);
                }}
                className={`px-3 py-2 rounded-md border transition flex flex-col items-center gap-1 ${
                  active
                    ? "bg-violet-50 border-violet-500 text-violet-700"
                    : "border-slate-200 text-slate-600 hover:bg-white"
                }`}
              >
                <Icon size={16} />
                <span className="text-xs font-medium leading-tight text-center">{m.label}</span>
              </button>
            );
          })}
        </div>

        {needsImage && (
          <ImageUploadField
            file={inputImage}
            preview={imagePreview}
            onPick={pickFile}
            inputRef={fileInputRef}
            uploading={uploading}
            validated={!!inputFileId}
          />
        )}

        <label className="block">
          <span className="text-sm font-medium text-slate-700">{t("grok.playground_prompt")}</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={jobType === "image"
              ? t("grok.playground_prompt_placeholder_image")
              : t("grok.playground_prompt_placeholder_video")}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            rows={3}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <label className="block">
            <span className="font-medium text-slate-700">{t("grok.playground_aspect")}</span>
            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value)}
              className="input mt-1 w-full"
            >
              {PLAYGROUND_ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          {jobType === "image" ? (
            <label className="block">
              <span className="font-medium text-slate-700">{t("grok.playground_quality")}</span>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="input mt-1 w-full"
              >
                {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </label>
          ) : (
            <>
              <label className="block">
                <span className="font-medium text-slate-700">{t("grok.playground_resolution")}</span>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as "480p" | "720p")}
                  className="input mt-1 w-full"
                >
                  <option value="480p">480p</option>
                  <option value="720p">720p</option>
                </select>
              </label>
              <label className="block">
                <span className="font-medium text-slate-700">{t("grok.playground_duration")}</span>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="input mt-1 w-full"
                >
                  <option value={6}>6</option>
                  <option value={10}>10</option>
                </select>
              </label>
            </>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => submit.mutate()}
            disabled={!prompt.trim() || submit.isPending || uploading || (needsImage && !inputFileId)}
            className="btn-primary inline-flex items-center gap-2"
          >
            {submit.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> {t("grok.playground_submitting")}</>
            ) : (
              <>{t("grok.playground_submit")} <ChevronRight size={14} /></>
            )}
          </button>
        </div>
      </div>

      {result && (
        <div className="card space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            <RefreshCw size={14} /> {t("grok.playground_last_submission")}
          </h3>
          <div className="flex items-center gap-2 text-sm">
            <code className="font-mono text-xs">{result.id.slice(0, 8)}</code>
            <StatusBadge status={result.status} />
            <span className="text-slate-500">{result.job_type}</span>
          </div>
          <p className="text-xs text-slate-500">
            {t("grok.playground_queued_prefix")}{" "}
            <a href="/grok/jobs" className="text-violet-600 hover:underline">/grok/jobs</a>.
          </p>
        </div>
      )}
    </>
  );
}


/** Drag-drop + click uploader cho reference image.
 *  Shown only when the active mode requires an attachment (i2i / i2v).
 *
 *  Statuses surfaced to the user:
 *    - uploading=true     → spinner + "Đang kiểm tra với Grok…"
 *    - validated=true     → green check + "Ảnh OK"
 *    - neither            → ảnh đã pick nhưng chưa upload (race) hoặc bị Grok từ chối
 */
function ImageUploadField({
  file, preview, onPick, inputRef, uploading, validated,
}: {
  file: File | null;
  preview: string | null;
  onPick: (f: File | null) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
  validated: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) onPick(f);
  };
  const borderColor = validated
    ? "border-emerald-400"
    : uploading
      ? "border-violet-400"
      : dragOver
        ? "border-violet-500 bg-violet-50"
        : "border-slate-200 hover:border-slate-300";
  return (
    <div>
      <label className="text-sm font-medium text-slate-700">Ảnh tham chiếu</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`mt-1 rounded-md border-2 border-dashed cursor-pointer transition p-3 flex items-center gap-3 ${borderColor}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        {preview ? (
          <>
            <img src={preview} alt="" className="w-20 h-20 object-cover rounded" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{file?.name}</div>
              <div className="text-xs text-slate-500">
                {file ? `${(file.size / 1024).toFixed(0)} KB · ${file.type}` : ""}
              </div>
              <div className="text-xs mt-1">
                {uploading ? (
                  <span className="text-violet-600 inline-flex items-center gap-1">
                    <Loader2 size={11} className="animate-spin" />
                    Đang kiểm tra với Grok…
                  </span>
                ) : validated ? (
                  <span className="text-emerald-600 inline-flex items-center gap-1">
                    <Check size={11} /> Ảnh đã được Grok chấp nhận
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              disabled={uploading}
              onClick={(e) => { e.stopPropagation(); onPick(null); }}
              className="text-slate-400 hover:text-rose-600 p-1 disabled:opacity-50"
              title="Bỏ ảnh"
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded bg-slate-100 grid place-items-center text-slate-400">
              <Upload size={20} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-700">Kéo thả ảnh vào đây</div>
              <div className="text-xs text-slate-500">hoặc click để chọn · PNG / JPG · ≤ 20MB</div>
              <div className="text-[11px] text-violet-700/80 mt-1">Sẽ check Grok content moderation ngay khi upload.</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

