// ─── Module showcase (album-art style) ─────────────────────────────────
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, ArrowRight, Play } from "lucide-react";

import { MODULES } from "../configs/landing-data";
import { SectionHeader } from "./SectionHeader";

export function ModuleShowcase() {
  const { t } = useTranslation();
  return (
    <section id="modules" className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
      <SectionHeader
        eyebrow={t("landing.modules_eyebrow", "4 module · 1 nền tảng")}
        title={<>{t("landing.modules_title_a", "Mọi công cụ AI bạn cần,")}<br /><span className="text-gradient">{t("landing.modules_title_b", "trong một dashboard.")}</span></>}
        subtitle={t("landing.modules_subtitle", "Đăng nhập 1 lần dùng được hết. Quota chia theo gói. Khách anonymous được thử AI Image ngay trên web.")}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
        {MODULES.map((m) => (
          <Link key={m.label} to={m.to} className="group block">
            <article className="album-card h-full flex flex-col">
              {/* Album art */}
              <div className={`relative aspect-square rounded-xl bg-gradient-to-br ${m.gradient} overflow-hidden mb-4 shadow-card-dark`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),transparent_60%)]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <m.icon size={56} className="text-white drop-shadow-lg" strokeWidth={1.5} />
                </div>
                {m.badge && (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    {m.badge}
                  </span>
                )}
                {/* Play overlay on hover */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-glow-pink">
                    <Play size={22} className="ml-0.5" />
                  </div>
                </div>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent-spotify">{m.tagline}</p>
              <h3 className="font-bold text-white text-lg mt-0.5">{m.label}</h3>
              <p className="text-sm text-slate-500 mt-1.5 leading-relaxed flex-1">{m.desc}</p>
              <ul className="mt-3 space-y-1">
                {m.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-slate-600">
                    <Check size={12} className="text-accent-spotify mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-spotify group-hover:gap-2 transition-all">
                {m.ctaText} <ArrowRight size={14} />
              </div>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}
