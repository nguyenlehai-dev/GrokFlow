// ─── Artist spotlight (AI model spotlight) ─────────────────────────────
import { useTranslation } from "react-i18next";
import { Star, Mic2 } from "lucide-react";

import { SectionHeader } from "./SectionHeader";

export function ArtistSpotlight() {
  const { t } = useTranslation();
  const artists = [
    {
      name: "Aurora", role: "Image generation",
      desc: "Mô hình ảnh photoreal / anime / art style hàng đầu — tích hợp sẵn.",
      gradient: "from-violet-600 to-fuchsia-600",
      stats: "Top-1 cho realism",
    },
    {
      name: "Grok-3", role: "Video gen",
      desc: "Image-to-video với motion coherent, lên đến 15 giây.",
      gradient: "from-pink-500 to-rose-500",
      stats: "Pro+ access",
    },
    {
      name: "GPT-4o / Claude", role: "LLM Gateway",
      desc: "Route giữa nhiều LLM provider, fallback tự động.",
      gradient: "from-cyan-500 to-indigo-500",
      stats: "Multi-provider",
    },
  ];
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
      <SectionHeader
        eyebrow={t("landing.artists_eyebrow", "Artist Spotlight")}
        title={<>{t("landing.artists_title_a", "Mô hình AI")} <span className="text-gradient">{t("landing.artists_title_b", "đỉnh nhất")}</span> {t("landing.artists_title_c", "hiện nay")}</>}
        subtitle={t("landing.artists_subtitle", "Chúng tôi tích hợp mọi provider hàng đầu trong 1 platform — bạn chọn, hệ thống route.")}
      />
      <div className="grid md:grid-cols-3 gap-5 mt-10">
        {artists.map((a) => (
          <div key={a.name} className="album-card">
            <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${a.gradient} flex items-center justify-center shadow-glow-pink mb-4`}>
              <Mic2 size={32} className="text-white" />
            </div>
            <p className="text-[11px] uppercase tracking-wider text-accent-spotify font-semibold">{a.role}</p>
            <h3 className="text-2xl font-bold text-white mt-0.5">{a.name}</h3>
            <p className="text-sm text-slate-500 mt-2">{a.desc}</p>
            <p className="text-xs font-mono text-accent-spotify mt-3 inline-flex items-center gap-1">
              <Star size={11} fill="currentColor" /> {a.stats}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
