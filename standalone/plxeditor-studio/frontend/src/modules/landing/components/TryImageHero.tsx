// ─── Hero ──────────────────────────────────────────────────────────────────
import { Link } from "react-router-dom";
import { Sparkles, Star, Lock, CheckCircle2 } from "lucide-react";

import type { TryImageQuotaResponse } from "../models/try-image";

type QuotaResp = TryImageQuotaResponse;

export function TryImageHero({ quota, isAuth }: { quota: QuotaResp | undefined; isAuth: boolean }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-violet-300/30 rounded-full blur-3xl" />
        <div className="absolute -top-12 right-0 w-[28rem] h-[28rem] bg-fuchsia-300/30 rounded-full blur-3xl" />
      </div>
      <div className="max-w-6xl mx-auto px-4 pt-12 pb-10 sm:pt-16 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-violet-200 bg-white/85 backdrop-blur-sm text-violet-700 text-xs font-semibold">
          <Star size={12} className="text-amber-500" />
          {isAuth ? "Logged in · Plan quota" : "Public preview · 2 ảnh miễn phí mỗi ngày"}
        </span>
        <h1 className="mt-5 text-3xl sm:text-5xl font-bold leading-[1.1] tracking-tight max-w-3xl mx-auto">
          Tạo ảnh AI bằng{" "}
          <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
            Grok Imagine
          </span>
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-xl mx-auto">
          Gõ mô tả ảnh bằng tiếng Việt hoặc tiếng Anh → bấm tạo → tải về. Không cần
          đăng ký, không cần thẻ.
        </p>
        {quota && <HeroQuotaBadge quota={quota} isAuth={isAuth} />}
      </div>
    </section>
  );
}

function HeroQuotaBadge({ quota, isAuth }: { quota: QuotaResp; isAuth: boolean }) {
  const exhausted = quota.remaining <= 0 && !isAuth;
  return (
    <div className="mt-6 inline-flex items-center gap-2 text-sm">
      {isAuth ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
          <CheckCircle2 size={14} />
          Đang dùng quota gói — không giới hạn ở /try/image
        </span>
      ) : exhausted ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700">
          <Lock size={14} />
          Đã hết lượt thử miễn phí · <Link to="/register" className="underline font-semibold">Đăng ký để tiếp tục</Link>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-violet-200 text-slate-700 shadow-sm">
          <Sparkles size={14} className="text-violet-500" />
          Còn <strong className="text-violet-700">{quota.remaining}</strong>/{quota.daily_cap} lượt miễn phí · reset sau 24h
        </span>
      )}
    </div>
  );
}
