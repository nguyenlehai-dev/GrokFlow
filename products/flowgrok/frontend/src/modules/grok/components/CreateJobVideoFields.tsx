import type { UseFormRegister } from "react-hook-form";
import type { CreateJobForm } from "./CreateJobForm.types";

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

export function CreateJobVideoResolutionAndDuration({
  register, can720p, can10s,
}: {
  register: UseFormRegister<CreateJobForm>;
  can720p: boolean;
  can10s: boolean;
}) {
  return (
    <>
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
    </>
  );
}

export function CreateJobVideoModeField({
  register, canSpicy, canFun, canCustom,
}: {
  register: UseFormRegister<CreateJobForm>;
  canSpicy: boolean;
  canFun: boolean;
  canCustom: boolean;
}) {
  return (
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
        <p className="text-xs text-slate-500 mt-1">
          Sau khi Grok render video, hệ thống tự click preset bạn chọn để regenerate phiên bản đó.
          {canSpicy && (
            <> <strong> Spicy (18+)</strong> chỉ có với account Pro/Heavy.</>
          )}
        </p>
      </div>
    </div>
  );
}
