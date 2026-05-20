// ─── Hero ──────────────────────────────────────────────────────────────
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, ArrowRight, Play, Sparkles } from "lucide-react";

export function Hero({ brandName }: { brandName: string }) {
  const { t } = useTranslation();
  return (
    <section
      className="relative overflow-hidden"
      style={{
        // Aurora signature hero — coral → magenta → indigo. Three-stop
        // warm-to-cool sweep, intentionally different from every
        // streaming-app two-stop gradient. This is our brand block.
        background: "linear-gradient(135deg, #ff6b6b 0%, #c147e9 50%, #4a2fbd 100%)",
      }}
    >
      {/* Aurora light: a soft warm highlight top-left, a cool mint hint
          bottom-right. Layered so the gradient has depth without going
          back to the generic mesh look. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 15% 10%, rgba(255,255,255,0.18), transparent 55%), " +
            "radial-gradient(ellipse at 85% 90%, rgba(0,224,180,0.14), transparent 50%)",
        }}
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-20 sm:pt-28 sm:pb-28">
        <div className="text-center max-w-3xl mx-auto space-y-6">
          {/* "Now playing" pill — translucent over the colour block. */}
          <div className="inline-flex items-center gap-2 rounded-full bg-black/40 backdrop-blur-sm px-4 py-1.5">
            <span className="flex items-end gap-0.5 h-3">
              <span className="eq-bar h-full animate-eq-bar-1 text-accent-spotify" />
              <span className="eq-bar h-full animate-eq-bar-2 text-accent-spotify" />
              <span className="eq-bar h-full animate-eq-bar-3 text-accent-spotify" />
            </span>
            <span className="text-xs font-semibold text-white/90">
              {t("landing.now_playing", "Đang phát")}: <span className="text-white">AI Image · Aurora model</span>
            </span>
          </div>

          <h1 className="font-display text-5xl sm:text-7xl font-bold tracking-[-0.03em] leading-[1.02] text-white">
            {t("landing.hero_title_1", "Một studio.")}<br />
            <span className="italic font-medium text-white/90">
              {t("landing.hero_title_2", "Mọi mô hình AI.")}
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed">
            {brandName} — {t("landing.hero_subtitle", "Quản lý mọi dự án AI — sinh ảnh, video, văn bản, code — trong một giao diện duy nhất, theo phong cách bảng điều khiển âm nhạc.")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link to="/register" className="btn-primary btn-lg">
              <Sparkles size={18} /> {t("landing.cta_start", "Bắt đầu miễn phí")}
              <ArrowRight size={18} />
            </Link>
            <Link
              to="/try/image"
              className="btn btn-lg rounded-full border-2 border-white text-white font-bold hover:bg-white/10 hover:scale-105 transition"
            >
              <Play size={18} /> {t("landing.cta_explore", "Khám phá studio")}
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-4 text-sm text-white/80">
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} className="text-white" /> {t("landing.no_card", "Không cần thẻ")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} className="text-white" /> {t("landing.free_jobs", "10 job/ngày free")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} className="text-white" /> {t("landing.multi_tenant", "Multi-tenant native")}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
