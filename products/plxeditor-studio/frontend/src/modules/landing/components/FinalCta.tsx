// ─── Final CTA ─────────────────────────────────────────────────────────
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Play, Sparkles, Headphones } from "lucide-react";

export function FinalCta() {
  const { t } = useTranslation();
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-20">
      <div
        className="relative overflow-hidden rounded-3xl p-12 text-center"
        style={{ background: "linear-gradient(135deg, #ff8a4c 0%, #c147e9 60%, #4a2fbd 100%)" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 80% 0%, rgba(0,224,180,0.18), transparent 55%)" }}
        />
        <div className="relative">
          <Headphones size={48} className="mx-auto text-white mb-4" />
          <h2 className="font-display text-3xl sm:text-5xl font-bold text-white tracking-[-0.02em] leading-tight">
            {t("landing.final_cta_title_a", "Sẵn sàng phát hành")}<br />{t("landing.final_cta_title_b", "studio AI của riêng bạn?")}
          </h2>
          <p className="mt-4 text-white/90 max-w-xl mx-auto">
            {t("landing.final_cta_sub", "Đăng ký miễn phí 30 giây. Không cần thẻ. Có 10 job/ngày để chơi ngay.")}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="bg-black text-white font-bold rounded-full px-7 py-3 inline-flex items-center gap-2 hover:scale-105 transition"
            >
              <Sparkles size={18} /> {t("landing.cta_start", "Bắt đầu miễn phí")}
            </Link>
            <Link
              to="/try/image"
              className="border-2 border-white text-white font-bold rounded-full px-7 py-3 inline-flex items-center gap-2 hover:bg-white/10 transition"
            >
              <Play size={18} /> {t("landing.cta_try_no_signup", "Thử không cần đăng ký")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
