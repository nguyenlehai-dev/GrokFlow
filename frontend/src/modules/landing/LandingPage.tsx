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
    <div className="min-h-screen bg-[#0a0a0a] text-ink-100 pb-24 md:pb-28">
      <TopNav brandName={brandName} />
      <Hero brandName={brandName} />
      <AppPreview />
      <GenrePills />
      <ModuleShowcase />
      <PlaylistCarousel
        eyebrow="Made for you"
        title="Mixes của tuần"
        items={MADE_FOR_YOU}
      />
      <ArtistSpotlight />
      <PlaylistCarousel
        eyebrow="Trending now"
        title="Use cases nổi bật"
        items={TRENDING}
      />
      <PricingSection />
      <Faq />
      <FinalCta />
      <Footer brandName={brandName} />
      <StickyPlayerBar />
    </div>
  );
}

// ─── Top nav ───────────────────────────────────────────────────────────

function TopNav({ brandName }: { brandName: string }) {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav
      className={`sticky top-0 z-30 transition-all ${
        scrolled
          ? "bg-black/85 backdrop-blur-md border-b border-ink-800"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 group">
          <span className="w-9 h-9 rounded-full bg-white text-ink-950 flex items-center justify-center font-extrabold">
            {brandName[0].toUpperCase()}
          </span>
          <span className="font-bold text-lg text-white">
            {brandName}
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-7 text-sm font-semibold text-white/80">
          <a href="#modules" className="hover:text-white transition">{t("landing.nav_products", "Sản phẩm")}</a>
          <a href="#pricing" className="hover:text-white transition">{t("landing.nav_pricing", "Gói cước")}</a>
          <a href="#faq" className="hover:text-white transition">{t("landing.nav_faq", "FAQ")}</a>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login" className="text-sm font-semibold text-white/80 hover:text-white px-3 py-1.5">{t("landing.nav_login", "Đăng nhập")}</Link>
          <Link to="/register" className="btn-primary btn-sm">{t("landing.nav_register", "Dùng thử")}</Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────

function Hero({ brandName }: { brandName: string }) {
  const { t } = useTranslation();
  return (
    <section
      className="relative overflow-hidden"
      style={{
        // Spotify Premium hero — saturated brand-coloured block with a
        // subtle vignette so the giant headline reads cleanly. The
        // colour stops are picked to match Spotify's "Premium" page
        // (purple → blue) but stay on-brand for us.
        background: "linear-gradient(135deg, #af2896 0%, #509bf5 100%)",
      }}
    >
      {/* Soft radial highlight, top-left, like Spotify Premium hero. */}
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.15), transparent 60%)" }} />
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

          <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight leading-[1.05] text-white drop-shadow-sm">
            {t("landing.hero_title_1", "Một studio.")}<br />
            {t("landing.hero_title_2", "Mọi mô hình AI.")}
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
              <p className="text-xs uppercase tracking-wider text-accent-spotify font-semibold">
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
                  <div className="w-14 h-14 rounded-full bg-white text-ink-900 flex items-center justify-center shadow-glow-pink">
                    <Play size={22} className="ml-0.5" />
                  </div>
                </div>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent-spotify">{m.tagline}</p>
              <h3 className="font-bold text-white text-lg mt-0.5">{m.label}</h3>
              <p className="text-sm text-ink-400 mt-1.5 leading-relaxed flex-1">{m.desc}</p>
              <ul className="mt-3 space-y-1">
                {m.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-ink-300">
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

// ─── Artist spotlight (AI model spotlight) ─────────────────────────────

function ArtistSpotlight() {
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
  const { t } = useTranslation();
  return (
    <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
      <SectionHeader
        eyebrow={t("landing.pricing_eyebrow", "Gói cước")}
        title={<>{t("landing.pricing_title_a", "Premium")} <span className="text-gradient">{t("landing.pricing_title_b", "subscription.")}</span></>}
        subtitle={t("landing.pricing_subtitle", "Hủy bất kỳ lúc nào. Không lock-in. Free tier không cần thẻ.")}
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
        {TIERS.map((tier) => (
          <div
            key={tier.code}
            className={`album-card flex flex-col h-full ${
              tier.highlight ? "ring-2 ring-accent-fuchsia shadow-glow-pink" : ""
            }`}
          >
            {tier.highlight && (
              <span className="badge-pink text-[10px] w-fit mb-3">{t("landing.pricing_popular", "⭐ Phổ biến nhất")}</span>
            )}
            <h3 className="text-xl font-bold text-white">{tier.name}</h3>
            <p className="text-sm text-ink-400 mt-1 min-h-[40px]">{tier.description}</p>
            <div className="mt-4 mb-5">
              {tier.priceVnd === 0 ? (
                <span className="text-4xl font-extrabold text-white">Free</span>
              ) : tier.priceVnd === null ? (
                <span className="text-3xl font-extrabold text-white">{tier.priceLabel}</span>
              ) : (
                <span>
                  <span className="text-4xl font-extrabold text-white">{fmtVnd(tier.priceVnd)}</span>
                  <span className="text-sm text-ink-400">{t("landing.pricing_per_month", "/tháng")}</span>
                </span>
              )}
            </div>
            <ul className="space-y-2 flex-1">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-ink-200">
                  <Check size={14} className="text-accent-spotify mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to={tier.ctaTo}
              className={`mt-6 ${
                tier.highlight ? "btn-primary" : "btn-secondary"
              } w-full justify-center`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── FAQ ───────────────────────────────────────────────────────────────

function Faq() {
  const { t } = useTranslation();
  const items = [
    {
      q: "Đây có phải chỉ dành cho một provider AI duy nhất?",
      a: "Không. Nền tảng quản lý đa-provider: image (Aurora/Grok), video, flow tools (xử lý local), LLM gateway (route OpenAI/Claude/Gemini). 1 dashboard, 1 API key.",
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
        eyebrow={t("landing.faq_eyebrow", "FAQ")}
        title={t("landing.faq_title", "Câu hỏi thường gặp")}
        subtitle={t("landing.faq_subtitle", "Không thấy câu trả lời? Gửi email admin@groks.io")}
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
              {open === i ? <Minus size={16} className="shrink-0 text-accent-spotify" /> : <Plus size={16} className="shrink-0 text-ink-400" />}
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
  const { t } = useTranslation();
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-20">
      <div className="relative overflow-hidden rounded-2xl p-12 text-center" style={{ background: "linear-gradient(135deg, #1db954 0%, #166534 100%)" }}>
        <div className="relative">
          <Headphones size={48} className="mx-auto text-white mb-4" />
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
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
      <p className="text-xs uppercase tracking-[0.2em] text-accent-spotify font-bold">{eyebrow}</p>
      <h2 className="text-3xl sm:text-5xl font-extrabold text-white mt-3 tracking-tight">{title}</h2>
      <p className="text-ink-400 mt-4 text-base sm:text-lg">{subtitle}</p>
    </div>
  );
}

// ─── App preview (Spotify-style mockup) ────────────────────────────────
// Faux streaming-app shell embedded in the landing page so visitors
// instantly recognise the "music app" framing. Sidebar (Home/Search/
// Library + playlists), main grid (greeting + Recently played tiles +
// Made For You row), and a docked player bar at the bottom of the
// frame.

const SIDEBAR_PLAYLISTS = [
  "AI Image · Top Picks",
  "Video Mixes",
  "Flow Productivity",
  "Gateway Routing",
  "Aurora favourites",
  "Liked Generations",
  "Weekly Drop",
];

const QUICK_TILES = [
  { name: "AI Image",       gradient: "from-violet-600 to-fuchsia-600" },
  { name: "AI Video",       gradient: "from-pink-500 to-rose-500" },
  { name: "Flow Tools",     gradient: "from-amber-500 to-orange-500" },
  { name: "LLM Gateway",    gradient: "from-cyan-500 to-indigo-500" },
  { name: "Liked Results",  gradient: "from-emerald-500 to-teal-500" },
  { name: "Recent Jobs",    gradient: "from-purple-600 to-blue-500" },
];

const MADE_FOR_YOU_TILES = [
  { title: "Daily Mix 1", subtitle: "Aurora · Grok-3 · Image",   gradient: "from-violet-700 via-fuchsia-600 to-pink-500" },
  { title: "Daily Mix 2", subtitle: "Cinematic video · 4:5",     gradient: "from-rose-600 via-orange-500 to-amber-400" },
  { title: "Daily Mix 3", subtitle: "GPT-4o · Claude · Gemini",  gradient: "from-indigo-600 via-cyan-500 to-emerald-400" },
  { title: "Daily Mix 4", subtitle: "Flow · Cut · Merge",        gradient: "from-fuchsia-700 via-pink-500 to-rose-400" },
];

function AppPreview() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mb-24 relative z-10">
      <div className="relative rounded-2xl bg-black border border-ink-800 overflow-hidden shadow-2xl">
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-800 bg-black">
          <span className="w-3 h-3 rounded-full bg-rose-500/80" />
          <span className="w-3 h-3 rounded-full bg-amber-400/80" />
          <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
          <div className="ml-3 flex-1 max-w-md mx-auto flex items-center gap-2 rounded-full bg-ink-900 px-3 py-1 text-xs text-ink-400">
            <Sparkles size={11} className="text-accent-spotify" />
            studio · GrokFlow workspace
          </div>
        </div>

        {/* App body */}
        <div className="grid grid-cols-[220px_1fr] min-h-[460px]">
          {/* Sidebar — true black, Spotify-style */}
          <aside className="bg-black border-r border-ink-900 p-4 space-y-6">
            <div className="space-y-1.5">
              {[
                { icon: ListMusic, label: "Home",   active: true },
                { icon: Globe,     label: "Search", active: false },
                { icon: Heart,     label: "Library",active: false },
              ].map((it) => (
                <div
                  key={it.label}
                  className={`flex items-center gap-3 px-3 py-1.5 rounded text-sm font-bold ${
                    it.active ? "text-white" : "text-ink-400 hover:text-white"
                  }`}
                >
                  <it.icon size={18} />
                  {it.label}
                </div>
              ))}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-400 font-bold px-3 mb-2">Your library</p>
              <div className="space-y-1 text-sm">
                {SIDEBAR_PLAYLISTS.map((p, i) => (
                  <div
                    key={p}
                    className={`px-3 py-1 rounded hover:text-white truncate ${i === 0 ? "text-white font-semibold" : "text-ink-400"}`}
                  >
                    {p}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Main — flat dark, Spotify-style. Subtle gradient at the
              top so it feels like an album-tinted header. */}
          <div className="bg-gradient-to-b from-ink-800 via-ink-950 to-ink-950 p-6 overflow-hidden">
            <p className="text-xs uppercase tracking-wider text-ink-400 font-semibold">
              Good evening
            </p>
            <h3 className="text-2xl font-extrabold text-white mt-1">
              Đâu là dự án bạn muốn chạy?
            </h3>

            {/* Quick tiles 3x2 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
              {QUICK_TILES.map((q) => (
                <div
                  key={q.name}
                  className="group flex items-center gap-3 rounded-md bg-ink-800/60 hover:bg-ink-700/70 transition pr-3 overflow-hidden"
                >
                  <div className={`w-12 h-12 bg-gradient-to-br ${q.gradient} flex items-center justify-center shrink-0`}>
                    <Disc3 size={20} className="text-white" />
                  </div>
                  <span className="text-sm font-semibold text-white truncate">{q.name}</span>
                </div>
              ))}
            </div>

            {/* Made for you row */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-white">Made for you</h4>
                <span className="text-xs text-ink-400">Hôm nay</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                {MADE_FOR_YOU_TILES.map((m) => (
                  <div key={m.title} className="rounded-lg bg-ink-800/40 p-2.5 hover:bg-ink-800/80 transition group">
                    <div className={`aspect-square rounded-md bg-gradient-to-br ${m.gradient} relative overflow-hidden shadow-card-dark`}>
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),transparent_60%)]" />
                      <div className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-accent-spotify text-ink-950 flex items-center justify-center shadow-brand-lg opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition">
                        <Play size={16} className="ml-0.5" />
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-white mt-2 truncate">{m.title}</p>
                    <p className="text-[11px] text-ink-400 truncate">{m.subtitle}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Mini player bar at the bottom of the frame — Spotify-style
            true black background. */}
        <div className="border-t border-ink-800 bg-black px-4 py-2.5 flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 w-48">
            <div className="w-10 h-10 rounded bg-gradient-to-br from-violet-600 to-fuchsia-600 shrink-0 flex items-center justify-center">
              <Disc3 size={18} className="text-white animate-spin" style={{ animationDuration: "8s" }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">Vietnamese girl · cinematic</p>
              <p className="text-[10px] text-ink-400">Aurora · AI Image</p>
            </div>
          </div>
          <div className="flex-1 max-w-xl mx-auto">
            <div className="flex items-center justify-center gap-4 text-ink-400">
              <button className="hover:text-white"><ListMusic size={14} /></button>
              <button className="w-7 h-7 rounded-full bg-white text-ink-900 flex items-center justify-center hover:scale-110 transition">
                <Pause size={13} />
              </button>
              <button className="hover:text-white"><Heart size={14} /></button>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-ink-500 font-mono">
              <span>0:08</span>
              <div className="flex-1 h-0.5 bg-ink-800 rounded-full overflow-hidden">
                <div className="h-full w-[62%] bg-accent-spotify rounded-full" />
              </div>
              <span>0:13</span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 w-48 justify-end text-ink-400">
            <Mic2 size={14} />
            <div className="w-20 h-0.5 bg-ink-800 rounded-full overflow-hidden">
              <div className="h-full w-[70%] bg-ink-400 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Genre pills ───────────────────────────────────────────────────────

const GENRES = [
  { label: "Photorealistic", gradient: "from-violet-600 to-fuchsia-600" },
  { label: "Anime",          gradient: "from-pink-500 to-rose-500" },
  { label: "Cinematic",      gradient: "from-amber-500 to-orange-500" },
  { label: "3D Render",      gradient: "from-cyan-500 to-indigo-500" },
  { label: "Logo / Brand",   gradient: "from-emerald-500 to-teal-500" },
  { label: "Short clip",     gradient: "from-purple-600 to-blue-500" },
  { label: "Voice clone",    gradient: "from-rose-600 to-amber-400" },
  { label: "Lipsync",        gradient: "from-indigo-600 to-fuchsia-500" },
  { label: "Music video",    gradient: "from-orange-500 to-pink-500" },
  { label: "Documentary",    gradient: "from-teal-500 to-emerald-400" },
];

function GenrePills() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
      <p className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-3">
        Browse by genre
      </p>
      <div className="flex flex-wrap gap-2.5">
        {GENRES.map((g) => (
          <span
            key={g.label}
            className={`relative overflow-hidden rounded-full px-4 py-2 text-sm font-semibold text-white cursor-pointer hover:scale-105 transition shadow-card-dark bg-gradient-to-br ${g.gradient}`}
          >
            {g.label}
          </span>
        ))}
      </div>
    </section>
  );
}

// ─── Horizontal playlist carousel (Spotify-style) ──────────────────────

type PlaylistTile = {
  title: string;
  subtitle: string;
  gradient: string;
  icon?: typeof Disc3;
};

const MADE_FOR_YOU: PlaylistTile[] = [
  { title: "Daily Mix 1", subtitle: "Aurora · photorealism",      gradient: "from-violet-700 via-fuchsia-600 to-pink-500" },
  { title: "Daily Mix 2", subtitle: "Cinematic 4:5 video",         gradient: "from-rose-600 via-orange-500 to-amber-400" },
  { title: "Daily Mix 3", subtitle: "LLM gateway · multi-route",   gradient: "from-indigo-600 via-cyan-500 to-emerald-400" },
  { title: "Daily Mix 4", subtitle: "Flow productivity",           gradient: "from-fuchsia-700 via-pink-500 to-rose-400" },
  { title: "Discover Weekly", subtitle: "Aurora drops + remix",    gradient: "from-emerald-600 via-teal-500 to-cyan-400" },
  { title: "Release Radar",   subtitle: "Models phát hành tuần này", gradient: "from-amber-500 via-rose-500 to-fuchsia-500" },
];

const TRENDING: PlaylistTile[] = [
  { title: "Brand campaign", subtitle: "Logo · poster · banner",  gradient: "from-violet-600 to-fuchsia-600" },
  { title: "TikTok shorts",  subtitle: "image-to-video · 15s",    gradient: "from-pink-500 to-rose-500" },
  { title: "E-commerce",     subtitle: "Product photoreal",       gradient: "from-orange-500 to-amber-400" },
  { title: "AI Avatar",      subtitle: "Talking head + voice",    gradient: "from-cyan-500 to-indigo-500" },
  { title: "Storyboard",     subtitle: "Concept → final frame",   gradient: "from-purple-600 to-pink-500" },
  { title: "Music cover",    subtitle: "Album art · cover photo", gradient: "from-emerald-500 to-cyan-500" },
];

function PlaylistCarousel({
  eyebrow, title, items,
}: { eyebrow: string; title: string; items: PlaylistTile[] }) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-end justify-between mb-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-accent-spotify font-bold">{eyebrow}</p>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-2">{title}</h3>
        </div>
        <a href="#modules" className="text-xs uppercase tracking-wider text-ink-400 hover:text-white font-semibold">
          Show all
        </a>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 snap-x snap-mandatory">
        {items.map((p) => (
          <div
            key={p.title}
            className="group shrink-0 w-44 snap-start rounded-xl bg-ink-900/70 hover:bg-ink-800/90 transition p-3 border border-ink-800/60 shadow-card-dark"
          >
            <div className={`relative aspect-square rounded-lg bg-gradient-to-br ${p.gradient} overflow-hidden shadow-card-dark`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),transparent_60%)]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Disc3 size={36} className="text-white/80" />
              </div>
              <div className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-accent-spotify text-ink-950 flex items-center justify-center shadow-brand-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition">
                <Play size={16} className="ml-0.5" />
              </div>
            </div>
            <p className="text-sm font-semibold text-white mt-3 truncate">{p.title}</p>
            <p className="text-[11px] text-ink-400 truncate">{p.subtitle}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Sticky player bar (docked to viewport bottom) ─────────────────────
// Mimics Spotify's persistent player. Dismissible. Hidden on small
// screens to keep mobile clean.

function StickyPlayerBar() {
  const [dismissed, setDismissed] = useState(false);
  const [playing, setPlaying] = useState(true);
  if (dismissed) return null;
  return (
    <div className="hidden md:flex fixed bottom-0 left-0 right-0 z-40 bg-black border-t border-ink-800 px-4 py-3 items-center gap-4 animate-slide-up">
      <div className="flex items-center gap-3 min-w-0 w-72 shrink-0">
        <div className="w-12 h-12 rounded bg-gradient-to-br from-violet-600 to-fuchsia-600 shrink-0 flex items-center justify-center">
          <Disc3 size={22} className={`text-white ${playing ? "animate-spin" : ""}`} style={{ animationDuration: "8s" }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">Vietnamese girl · cinematic</p>
          <p className="text-xs text-ink-400 truncate">Aurora · AI Image · 1:1</p>
        </div>
        <button className="text-ink-400 hover:text-accent-spotify">
          <Heart size={16} />
        </button>
      </div>
      <div className="flex-1 max-w-2xl mx-auto">
        <div className="flex items-center justify-center gap-5 text-ink-300">
          <button className="hover:text-white"><ListMusic size={16} /></button>
          <button
            onClick={() => setPlaying((p) => !p)}
            className="w-9 h-9 rounded-full bg-white text-ink-950 flex items-center justify-center hover:scale-110 transition"
          >
            {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
          </button>
          <button className="hover:text-white"><Mic2 size={16} /></button>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-ink-500 font-mono">
          <span>0:08</span>
          <div className="flex-1 h-0.5 bg-ink-800 rounded-full overflow-hidden">
            <div className="h-full w-[62%] bg-accent-spotify rounded-full" />
          </div>
          <span>0:13</span>
        </div>
      </div>
      <div className="hidden lg:flex items-center gap-2 w-56 justify-end text-ink-400 shrink-0">
        <Mic2 size={16} />
        <div className="w-24 h-1 bg-ink-800 rounded-full overflow-hidden">
          <div className="h-full w-[70%] bg-ink-400 rounded-full" />
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 text-ink-500 hover:text-white"
          aria-label="Dismiss player"
        >
          <Minus size={16} />
        </button>
      </div>
    </div>
  );
}
