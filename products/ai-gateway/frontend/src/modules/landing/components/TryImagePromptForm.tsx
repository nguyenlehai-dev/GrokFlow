// ─── Prompt form ──────────────────────────────────────────────────────────
import { Link } from "react-router-dom";
import {
  Sparkles, Loader2, Crown, Zap, Lock, Check,
} from "lucide-react";

import { ASPECTS } from "../configs/try-image-data";

export function TryImagePromptForm({
  prompt, setPrompt, aspect, setAspect, quality, setQuality,
  onSubmit, submitDisabled, isPending, isRendering, remaining, isAuth, isExhausted,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  aspect: string;
  setAspect: (v: string) => void;
  quality: "speed" | "quality";
  setQuality: (v: "speed" | "quality") => void;
  onSubmit: () => void;
  submitDisabled: boolean;
  isPending: boolean;
  isRendering: boolean;
  remaining: number;
  isAuth: boolean;
  isExhausted: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 sm:p-6 ring-1 ring-slate-200 shadow-sm">
      <label className="block">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5">
            <Sparkles size={14} className="text-violet-500" /> Mô tả ảnh (prompt)
          </span>
          <span className="text-xs text-slate-9000 font-mono">
            {prompt.length}/2000
          </span>
        </div>
        <textarea
          className="w-full rounded-lg border border-slate-200 px-3 py-3 text-sm font-mono outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 transition resize-none"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ví dụ: A dragon flying over Ha Long Bay at sunset, watercolor style, cinematic lighting"
          maxLength={2000}
        />
      </label>

      {/* Aspect chips */}
      <div className="mt-4">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Khung hình</p>
        <div className="flex flex-wrap gap-1.5">
          {ASPECTS.map((a) => (
            <button
              key={a.v}
              type="button"
              onClick={() => setAspect(a.v)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md border transition ${
                aspect === a.v
                  ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="font-mono">{a.v}</span>
              <span className="opacity-70 ml-1">· {a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quality chips */}
      <div className="mt-4">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Chất lượng</p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setQuality("speed")}
            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-md border inline-flex items-center justify-center gap-1.5 transition ${
              quality === "speed"
                ? "bg-fuchsia-600 text-white border-fuchsia-600 shadow-sm"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Zap size={14} /> Nhanh (~15s)
          </button>
          <button
            type="button"
            onClick={() => setQuality("quality")}
            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-md border inline-flex items-center justify-center gap-1.5 transition ${
              quality === "quality"
                ? "bg-fuchsia-600 text-white border-fuchsia-600 shadow-sm"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Crown size={14} /> Cao (~45s)
          </button>
        </div>
      </div>

      {/* Submit row */}
      <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-500">
          {isAuth ? (
            <span className="inline-flex items-center gap-1">
              <Check size={12} className="text-emerald-500" /> Dùng quota gói
            </span>
          ) : isExhausted ? (
            <span className="inline-flex items-center gap-1 text-rose-600">
              <Lock size={12} /> Đã hết — <Link to="/register" className="underline">đăng ký</Link> để tiếp tục
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Sparkles size={12} className="text-violet-500" />
              Còn <strong className="text-violet-700">{remaining}</strong> lượt miễn phí
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitDisabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-6 py-2.5 text-sm font-semibold shadow-md hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isPending ? (
            <><Loader2 size={14} className="animate-spin" /> Đang gửi…</>
          ) : isRendering ? (
            <><Loader2 size={14} className="animate-spin" /> Đang render…</>
          ) : (
            <><Sparkles size={14} /> Tạo ảnh</>
          )}
        </button>
      </div>
    </div>
  );
}
