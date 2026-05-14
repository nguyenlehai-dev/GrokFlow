/**
 * Public landing — dark-mode music-streaming aesthetic.
 *
 * The platform handles multiple AI providers (image / video / flow tools /
 * gateway), so we frame each module as an "album" the user can browse,
 * and the demo widget as a "now playing" player. This file is intentionally
 * self-contained — sections are local components below.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Check, Image as ImageIcon, Video, Wand2, Scissors, Cpu,
  ArrowRight, Play, Sparkles, Star,
  Globe, Plus, Minus, Headphones, Heart, Disc3,
  ListMusic, Mic2, Pause,
} from "lucide-react";
import { useDomainStore } from "@/core/domain/store";

// ─── Pricing tiers (in sync with backend/entitlements/catalog.py) ──────

type Tier = {
  code: string;
  name: string;
  priceVnd: number | null;
  priceLabel?: string;
  description: string;
  highlight?: boolean;
  features: string[];
  cta: string;
  ctaTo: string;
};

const TIERS: Tier[] = [
  {
    code: "free", name: "Free", priceVnd: 0,
    description: "Bắt đầu miễn phí, không cần thẻ",
    features: ["10 job/ngày", "Aspect ratio cơ bản", "1 API key", "Hỗ trợ Discord"],
    cta: "Đăng ký miễn phí", ctaTo: "/register",
  },
  {
    code: "basic", name: "Basic", priceVnd: 199000,
    description: "Cá nhân, freelancer — ảnh + video cơ bản",
    features: ["Image + Video", "Image-to-image", "Full aspect ratios", "Email support"],
    cta: "Lên Basic", ctaTo: "/register?plan=basic",
  },
  {
    code: "pro", name: "Pro", priceVnd: 499000, highlight: true,
    description: "Sản xuất nội dung chuyên nghiệp",
    features: ["Quality mode", "Concurrent jobs", "Webhook", "API key pool", "Priority queue"],
    cta: "Lên Pro · phổ biến", ctaTo: "/register?plan=pro",
  },
  {
    code: "premium", name: "Premium", priceVnd: null, priceLabel: "Tuỳ chỉnh",
    description: "Team / agency — quota cao, SLA, white-label",
    features: ["Unlimited concurrent", "White-label brand", "Dedicated profile pool", "SLA 99.9%"],
    cta: "Liên hệ", ctaTo: "/register?plan=premium",
  },
];

// ─── Module catalog (rendered as album-art cards) ──────────────────────

type ModuleCard = {
  label: string;
  tagline: string;
  desc: string;
  icon: typeof ImageIcon;
  // Album-art gradient (CSS class). Each module owns its own tone.
  gradient: string;
  ctaText: string;
  to: string;
  features: readonly string[];
  badge?: string;
};

const MODULES: readonly ModuleCard[] = [
  {
    label: "AI Image", tagline: "Generate · Edit · Stylize",
    desc: "Aurora · Grok-2 · Grok-3 — full aspect ratios, speed/quality mode, image-to-image.",
    icon: ImageIcon,
    gradient: "from-violet-600 via-fuchsia-600 to-pink-500",
    ctaText: "Thử ngay", to: "/try/image",
    badge: "Free",
    features: ["Aurora model", "Image-to-image", "5 tỉ lệ", "Quality mode (Pro)"],
  },
  {
    label: "AI Video", tagline: "Text · Image · Remix",
    desc: "Text-to-video & image-to-video. 480p/720p, 3-15s, fun + custom mode.",
    icon: Video,
    gradient: "from-pink-500 via-rose-500 to-orange-500",
    ctaText: "Cần Basic+", to: "/register?plan=basic",
    badge: "199k+",
    features: ["Text-to-video", "Image-to-video", "Fun mode", "Đến 15s"],
  },
  {
    label: "Flow Tools", tagline: "Cut · Merge · Resize",
    desc: "Cắt ghép video, đổi tỉ lệ, tách audio. Xử lý local trong browser, không cần Adobe.",
    icon: Scissors,
    gradient: "from-amber-500 via-orange-500 to-rose-500",
    ctaText: "Mở trong app", to: "/register",
    features: ["Cut video", "Merge audio", "Resize", "Trích frames"],
  },
  {
    label: "LLM Gateway", tagline: "Route · Pool · Stream",
    desc: "1 API key — auto route OpenAI / Gemini / Claude / Grok. Pool + rotation tự động.",
    icon: Cpu,
    gradient: "from-cyan-500 via-sky-500 to-indigo-500",
    ctaText: "Cần Pro+", to: "/register?plan=pro",
    badge: "v1",
    features: ["Multi-provider", "Key rotation", "Rate limit", "Async + sync"],
  },
];

// ─── Page ──────────────────────────────────────────────────────────────

export function LandingPage() {
  const brandName = useDomainStore((s) => s.config?.brand_name) ?? "GrokFlow";

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100 selection:bg-brand-500/30">
      <TopNav brandName={brandName} />
      <Hero brandName={brandName} />
      <NowPlayingDemo />
      <ModuleShowcase />
      <ArtistSpotlight />
      <PricingSection />
      <Faq />
      <FinalCta />
      <Footer brandName={brandName} />
    </div>
  );
}

// ─── Top nav ───────────────────────────────────────────────────────────

function TopNav({ brandName }: { brandName: string }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav
      className={`sticky top-0 z-30 transition-all border-b ${
        scrolled
          ? "glass border-ink-800/60"
          : "border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 group">
          <span className="w-9 h-9 rounded-xl bg-gradient-album text-white flex items-center justify-center font-bold shadow-brand">
            {brandName[0].toUpperCase()}
          </span>
          <span className="font-bold text-lg text-white group-hover:text-gradient transition-all">
            {brandName}
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-7 text-sm text-ink-300">
          <a href="#modules" className="hover:text-white transition">Sản phẩm</a>
          <a href="#pricing" className="hover:text-white transition">Gói cước</a>
          <a href="#faq" className="hover:text-white transition">FAQ</a>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login" className="btn-ghost btn-sm">Đăng nhập</Link>
          <Link to="/register" className="btn-primary btn-sm">Dùng thử</Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────

function Hero({ brandName }: { brandName: string }) {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden">
      {/* Animated mesh background */}
      <div className="absolute inset-0 bg-gradient-mesh-dark pointer-events-none" />
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent-fuchsia/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-cyan/10 blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="text-center max-w-3xl mx-auto space-y-6">
          {/* "Now playing" pill */}
          <div className="inline-flex items-center gap-2 rounded-full bg-ink-900/70 backdrop-blur-md border border-ink-800 px-4 py-1.5">
            <span className="flex items-end gap-0.5 h-3">
              <span className="eq-bar h-full animate-eq-bar-1 text-accent-spotify" />
              <span className="eq-bar h-full animate-eq-bar-2 text-accent-spotify" />
              <span className="eq-bar h-full animate-eq-bar-3 text-accent-spotify" />
            </span>
            <span className="text-xs font-semibold text-ink-200">
              {t("landing.now_playing", "Đang phát")}: <span className="text-white">AI Image · Aurora model</span>
            </span>
          </div>

          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight leading-[1.05]">
            {t("landing.hero_title_1", "Một studio.")}<br />
            <span className="text-gradient">{t("landing.hero_title_2", "Mọi mô hình AI.")}</span>
          </h1>
          <p className="text-lg sm:text-xl text-ink-300 max-w-2xl mx-auto leading-relaxed">
            {brandName} — {t("landing.hero_subtitle", "Quản lý mọi dự án AI — sinh ảnh, video, văn bản, code — trong một giao diện duy nhất, theo phong cách bảng điều khiển âm nhạc.")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link to="/register" className="btn-primary btn-lg">
              <Sparkles size={18} /> {t("landing.cta_start", "Bắt đầu miễn phí")}
              <ArrowRight size={18} />
            </Link>
            <Link to="/try/image" className="btn-secondary btn-lg">
              <Play size={18} /> {t("landing.cta_explore", "Khám phá studio")}
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-4 text-sm text-ink-400">
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} className="text-accent-spotify" /> Không cần thẻ
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} className="text-accent-spotify" /> 10 job/ngày free
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} className="text-accent-spotify" /> Multi-tenant native
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Now-playing demo widget ───────────────────────────────────────────

function NowPlayingDemo() {
  const [playing, setPlaying] = useState(true);
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 -mt-12 mb-20 relative z-10">
      <div className="rounded-3xl bg-gradient-to-br from-ink-900 via-ink-900 to-ink-950 border border-ink-800/80 shadow-card-dark-hover overflow-hidden">
        <div className="grid md:grid-cols-[280px_1fr] gap-0">
          {/* Album art preview */}
          <div className="relative aspect-square md:aspect-auto bg-gradient-album overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),transparent_50%)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Disc3 size={120} className={`text-white/80 ${playing ? "animate-spin" : ""}`} style={{ animationDuration: "8s" }} />
            </div>
          </div>
          {/* Player body */}
          <div className="p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-wider text-accent-fuchsia font-semibold">
                Now Playing · Demo
              </p>
              <h3 className="text-2xl font-bold text-white mt-1">
                Vietnamese girl, cinematic light
              </h3>
              <p className="text-sm text-ink-400 mt-1">
                AI Image · Aurora model · 1:1 · Quality
              </p>
            </div>
            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="h-1 bg-ink-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-album rounded-full transition-all duration-1000"
                  style={{ width: playing ? "62%" : "0%" }}
                />
              </div>
              <div className="flex justify-between text-xs text-ink-500 font-mono">
                <span>0:08</span>
                <span>0:13</span>
              </div>
            </div>
            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button className="w-9 h-9 rounded-full border border-ink-700 text-ink-300 hover:text-white hover:border-white flex items-center justify-center transition">
                  <Heart size={15} />
                </button>
                <button className="w-9 h-9 rounded-full border border-ink-700 text-ink-300 hover:text-white hover:border-white flex items-center justify-center transition">
                  <ListMusic size={15} />
                </button>
              </div>
              <button
                onClick={() => setPlaying((p) => !p)}
                className="w-14 h-14 rounded-full bg-gradient-album text-white flex items-center justify-center shadow-brand hover:scale-105 active:scale-95 transition"
              >
                {playing ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
              </button>
              <Link to="/try/image" className="btn-secondary btn-sm">
                Tự thử <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-ink-500 mt-3">
        ↑ Đây là preview UI — bấm <strong>Tự thử</strong> để generate ảnh thật ngay không cần đăng ký.
      </p>
    </section>
  );
}

// ─── Module showcase (album-art style) ─────────────────────────────────

function ModuleShowcase() {
  return (
    <section id="modules" className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
      <SectionHeader
        eyebrow="4 module · 1 nền tảng"
        title={<>Mọi công cụ AI bạn cần,<br /><span className="text-gradient">trong một dashboard.</span></>}
        subtitle="Đăng nhập 1 lần dùng được hết. Quota chia theo gói. Khách anonymous được thử AI Image ngay trên web."
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
                  <div className="w-14 h-14 rounded-full bg-white text-ink-900 flex items-center justify-center shadow-glow-pink">
                    <Play size={22} className="ml-0.5" />
                  </div>
                </div>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent-fuchsia">{m.tagline}</p>
              <h3 className="font-bold text-white text-lg mt-0.5">{m.label}</h3>
              <p className="text-sm text-ink-400 mt-1.5 leading-relaxed flex-1">{m.desc}</p>
              <ul className="mt-3 space-y-1">
                {m.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-ink-300">
                    <Check size={12} className="text-accent-spotify mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-fuchsia group-hover:gap-2 transition-all">
                {m.ctaText} <ArrowRight size={14} />
              </div>
            </article>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Artist spotlight (AI model spotlight) ─────────────────────────────

function ArtistSpotlight() {
  const artists = [
    {
      name: "Aurora", role: "Image generation",
      desc: "Mô hình ảnh chủ lực của Grok — photoreal, anime, art style.",
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
        eyebrow="Artist Spotlight"
        title={<>Mô hình AI <span className="text-gradient">đỉnh nhất</span> hiện nay</>}
        subtitle="Chúng tôi tích hợp mọi provider hàng đầu trong 1 platform — bạn chọn, hệ thống route."
      />
      <div className="grid md:grid-cols-3 gap-5 mt-10">
        {artists.map((a) => (
          <div key={a.name} className="album-card">
            <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${a.gradient} flex items-center justify-center shadow-glow-pink mb-4`}>
              <Mic2 size={32} className="text-white" />
            </div>
            <p className="text-[11px] uppercase tracking-wider text-accent-fuchsia font-semibold">{a.role}</p>
            <h3 className="text-2xl font-bold text-white mt-0.5">{a.name}</h3>
            <p className="text-sm text-ink-400 mt-2">{a.desc}</p>
            <p className="text-xs font-mono text-accent-spotify mt-3 inline-flex items-center gap-1">
              <Star size={11} fill="currentColor" /> {a.stats}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Pricing ───────────────────────────────────────────────────────────

function fmtVnd(n: number): string {
  return n.toLocaleString("vi-VN") + " ₫";
}

function PricingSection() {
  return (
    <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
      <SectionHeader
        eyebrow="Gói cước"
        title={<>Premium <span className="text-gradient">subscription.</span></>}
        subtitle="Hủy bất kỳ lúc nào. Không lock-in. Free tier không cần thẻ."
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
        {TIERS.map((t) => (
          <div
            key={t.code}
            className={`album-card flex flex-col h-full ${
              t.highlight ? "ring-2 ring-accent-fuchsia shadow-glow-pink" : ""
            }`}
          >
            {t.highlight && (
              <span className="badge-pink text-[10px] w-fit mb-3">⭐ Phổ biến nhất</span>
            )}
            <h3 className="text-xl font-bold text-white">{t.name}</h3>
            <p className="text-sm text-ink-400 mt-1 min-h-[40px]">{t.description}</p>
            <div className="mt-4 mb-5">
              {t.priceVnd === 0 ? (
                <span className="text-4xl font-extrabold text-white">Free</span>
              ) : t.priceVnd === null ? (
                <span className="text-3xl font-extrabold text-white">{t.priceLabel}</span>
              ) : (
                <span>
                  <span className="text-4xl font-extrabold text-white">{fmtVnd(t.priceVnd)}</span>
                  <span className="text-sm text-ink-400">/tháng</span>
                </span>
              )}
            </div>
            <ul className="space-y-2 flex-1">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-ink-200">
                  <Check size={14} className="text-accent-spotify mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to={t.ctaTo}
              className={`mt-6 ${
                t.highlight ? "btn-primary" : "btn-secondary"
              } w-full justify-center`}
            >
              {t.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── FAQ ───────────────────────────────────────────────────────────────

function Faq() {
  const items = [
    {
      q: "Hệ thống này chỉ dùng cho Grok?",
      a: "Không. Nền tảng quản lý đa-provider: image (Aurora/Grok), video (Grok), flow tools (xử lý local), LLM gateway (route OpenAI/Claude/Gemini). 1 dashboard, 1 API key.",
    },
    {
      q: "Có cần biết code không?",
      a: "Không. UI đầy đủ để submit job, xem kết quả, quản lý profile. Khi cần auto hoá, dùng API key của bạn.",
    },
    {
      q: "Free tier hạn chế thế nào?",
      a: "10 job/ngày, 100 job/tháng. Aspect ratio cơ bản, model speed. Đủ để thử + làm demo. Upgrade khi cần production.",
    },
    {
      q: "Multi-tenant nghĩa là gì?",
      a: "Bạn có thể tạo nhiều 'domain' — mỗi domain là 1 tenant riêng, có brand riêng, quota riêng, user riêng. Phù hợp khi resell hoặc làm white-label.",
    },
    {
      q: "Dữ liệu của tôi có an toàn?",
      a: "Cookies, API key, ảnh được lưu mã hoá. Backup hàng ngày. Tuân thủ GDPR. Server đặt tại VN, tiếng Việt support.",
    },
  ];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
      <SectionHeader
        eyebrow="FAQ"
        title="Câu hỏi thường gặp"
        subtitle="Không thấy câu trả lời? Gửi email admin@groks.io"
      />
      <div className="mt-10 space-y-2.5">
        {items.map((it, i) => (
          <div key={i} className="card-hover">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between text-left text-sm font-semibold text-white"
            >
              {it.q}
              {open === i ? <Minus size={16} className="shrink-0 text-accent-fuchsia" /> : <Plus size={16} className="shrink-0 text-ink-400" />}
            </button>
            {open === i && (
              <p className="mt-3 text-sm text-ink-300 leading-relaxed animate-slide-up">{it.a}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Final CTA ─────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-20">
      <div className="relative overflow-hidden rounded-3xl p-12 text-center bg-gradient-album shadow-glow-pink">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.25),transparent_50%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(6,182,212,0.25),transparent_50%)] pointer-events-none" />
        <div className="relative">
          <Headphones size={48} className="mx-auto text-white/90 mb-4" />
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Sẵn sàng phát hành<br />studio AI của riêng bạn?
          </h2>
          <p className="mt-4 text-white/90 max-w-xl mx-auto">
            Đăng ký miễn phí 30 giây. Không cần thẻ. Có 10 job/ngày để chơi ngay.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="bg-white text-ink-900 font-bold rounded-lg px-7 py-3 inline-flex items-center gap-2 shadow-card-hover hover:scale-105 transition"
            >
              <Sparkles size={18} /> Bắt đầu miễn phí
            </Link>
            <Link
              to="/try/image"
              className="border-2 border-white/40 text-white font-bold rounded-lg px-7 py-3 inline-flex items-center gap-2 hover:bg-white/10 transition"
            >
              <Play size={18} /> Thử không cần đăng ký
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────

function Footer({ brandName }: { brandName: string }) {
  return (
    <footer className="border-t border-ink-800/70 mt-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid md:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-lg bg-gradient-album text-white flex items-center justify-center font-bold text-xs">
              {brandName[0]}
            </span>
            <span className="font-bold text-white">{brandName}</span>
          </div>
          <p className="text-ink-400 text-xs leading-relaxed">
            Multi-tenant AI studio. Image, Video, Flow, Gateway. Một nền tảng.
          </p>
        </div>
        <div>
          <p className="font-semibold text-ink-200 mb-3">Sản phẩm</p>
          <ul className="space-y-2 text-ink-400">
            <li><Link to="/try/image" className="hover:text-white">Try Image</Link></li>
            <li><a href="#modules" className="hover:text-white">Modules</a></li>
            <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-ink-200 mb-3">Tài nguyên</p>
          <ul className="space-y-2 text-ink-400">
            <li><a href="#faq" className="hover:text-white">FAQ</a></li>
            <li><a href="/terms" className="hover:text-white">Điều khoản</a></li>
            <li><a href="/privacy" className="hover:text-white">Bảo mật</a></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-ink-200 mb-3">Liên hệ</p>
          <ul className="space-y-2 text-ink-400">
            <li><a href="mailto:admin@groks.io" className="hover:text-white">admin@groks.io</a></li>
            <li className="inline-flex items-center gap-1">
              <Globe size={12} /> Server tại VN
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-800/70 py-5 text-center text-xs text-ink-500">
        © {new Date().getFullYear()} {brandName}. All rights reserved.
      </div>
    </footer>
  );
}

// ─── Reusable section header ───────────────────────────────────────────

function SectionHeader({
  eyebrow, title, subtitle,
}: { eyebrow: string; title: React.ReactNode; subtitle: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <p className="text-xs uppercase tracking-[0.2em] text-accent-fuchsia font-bold">{eyebrow}</p>
      <h2 className="text-3xl sm:text-5xl font-extrabold text-white mt-3 tracking-tight">{title}</h2>
      <p className="text-ink-400 mt-4 text-base sm:text-lg">{subtitle}</p>
    </div>
  );
}
