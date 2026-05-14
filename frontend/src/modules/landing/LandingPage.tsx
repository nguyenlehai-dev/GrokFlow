import { Link } from "react-router-dom";
import {
  Check, Image as ImageIcon, Video, Zap, Shield, Code2, Sparkles,
  Wand2, Scissors, Cpu, ArrowRight, PlayCircle, Crown, Star, Layers,
  Globe, BookOpen, Github,
} from "lucide-react";
import { useDomainStore } from "@/core/domain/store";

type Tier = {
  code: string;
  name: string;
  priceVnd: number | null;
  priceLabel?: string;
  description: string;
  highlight?: boolean;
  features: string[];
  limits: { label: string; value: string }[];
  cta: string;
  ctaTo: string;
};

const TIERS: Tier[] = [
  {
    code: "free",
    name: "Free",
    priceVnd: 0,
    description: "Dùng thử miễn phí — tạo ảnh chất lượng cơ bản",
    features: ["Tạo job ảnh", "Aspect ratio cơ bản", "2 lượt thử /try/image không cần đăng ký"],
    limits: [
      { label: "Job mỗi ngày", value: "10" },
      { label: "Job mỗi tháng", value: "100" },
      { label: "API Key", value: "1" },
      { label: "Profile", value: "1" },
    ],
    cta: "Đăng ký miễn phí",
    ctaTo: "/register",
  },
  {
    code: "basic",
    name: "Basic",
    priceVnd: 199000,
    description: "Cá nhân + freelancer — ảnh + video cơ bản",
    features: ["Tạo ảnh + video", "Image-to-image", "Fun mode", "Full aspect ratios"],
    limits: [
      { label: "Job mỗi ngày", value: "50" },
      { label: "Job mỗi tháng", value: "1,000" },
      { label: "API Key", value: "2" },
      { label: "Profile", value: "2" },
    ],
    cta: "Chọn gói Basic",
    ctaTo: "/register?plan=basic",
  },
  {
    code: "pro",
    name: "Pro",
    priceVnd: 599000,
    description: "Cho team — chất lượng cao, full API, audit log",
    highlight: true,
    features: [
      "Tất cả tính năng Basic",
      "Image quality cao",
      "Video 720p + 10s + Custom mode",
      "Image-to-video",
      "Public API v1",
      "Webhooks + Audit log",
    ],
    limits: [
      { label: "Job mỗi ngày", value: "200" },
      { label: "Job mỗi tháng", value: "5,000" },
      { label: "API Key", value: "5" },
      { label: "Profile", value: "5" },
    ],
    cta: "Chọn gói Pro",
    ctaTo: "/register?plan=pro",
  },
  {
    code: "enterprise",
    name: "Enterprise",
    priceVnd: null,
    priceLabel: "Liên hệ",
    description: "Doanh nghiệp — không giới hạn, hỗ trợ ưu tiên",
    features: [
      "Tất cả tính năng Pro",
      "Spicy mode 18+",
      "SLA + Hỗ trợ 24/7",
      "Custom plan",
      "Multi-domain branding",
    ],
    limits: [
      { label: "Job mỗi ngày", value: "2,000" },
      { label: "Job mỗi tháng", value: "50,000" },
      { label: "API Key", value: "20" },
      { label: "Profile", value: "20" },
    ],
    cta: "Liên hệ Sale",
    ctaTo: "/register?plan=enterprise",
  },
];

const formatVnd = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(n) + "₫";

// 4 product modules — direct entry points the landing page surfaces as
// "tabs". Each links to a public try-page or playground; quotas + auth
// are handled downstream.
const MODULES = [
  {
    label: "Grok Image",
    desc: "Tạo ảnh AI từ prompt — Aurora / Grok-2 / Grok-3, full aspect ratios.",
    icon: ImageIcon,
    tone: "violet",
    to: "/try/image",
    publicCta: "Thử ngay — 2 ảnh miễn phí",
  },
  {
    label: "Grok Video",
    desc: "Video 720p từ text hoặc image. Fun + Custom mode. Duration tới 15s.",
    icon: Video,
    tone: "fuchsia",
    to: "/register?plan=basic",
    publicCta: "Đăng ký để dùng",
  },
  {
    label: "Flow Tools",
    desc: "Cut, merge, resize, extract audio. Xử lý video local nhanh, không cần Adobe.",
    icon: Scissors,
    tone: "amber",
    to: "/register",
    publicCta: "Dùng trong app",
  },
  {
    label: "LLM Gateway",
    desc: "Một API key, route giữa OpenAI, Gemini, Claude. Quản lý pool + rate limit.",
    icon: Cpu,
    tone: "cyan",
    to: "/register?plan=pro",
    publicCta: "Cần gói Pro",
  },
] as const;

const TONE_BG: Record<string, { bg: string; text: string; ring: string; btn: string }> = {
  violet:  { bg: "bg-violet-50",  text: "text-violet-700",  ring: "ring-violet-200",  btn: "bg-violet-600 hover:bg-violet-700"  },
  fuchsia: { bg: "bg-fuchsia-50", text: "text-fuchsia-700", ring: "ring-fuchsia-200", btn: "bg-fuchsia-600 hover:bg-fuchsia-700" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-200",   btn: "bg-amber-600 hover:bg-amber-700"    },
  cyan:    { bg: "bg-cyan-50",    text: "text-cyan-700",    ring: "ring-cyan-200",    btn: "bg-cyan-600 hover:bg-cyan-700"      },
};

export function LandingPage() {
  const brandName = useDomainStore((s) => s.config?.brand_name) ?? "GrokFlow";
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-fuchsia-50/30">
      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="text-xl font-bold inline-flex items-center gap-1.5">
            <Wand2 size={22} className="text-violet-600" />
            <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
              {brandName}
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-5 text-sm text-slate-600">
            <a href="#modules" className="hover:text-violet-600">Tính năng</a>
            <a href="#pricing" className="hover:text-violet-600">Bảng giá</a>
            <Link to="/try/image" className="hover:text-violet-600 inline-flex items-center gap-1">
              <Sparkles size={12} /> Thử miễn phí
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost text-sm hidden sm:inline-flex">Đăng nhập</Link>
            <Link to="/register" className="btn-primary text-sm">Đăng ký</Link>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-12 sm:py-20 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold mb-5">
          <Star size={12} /> Phiên bản 0.5 — public try-image ra mắt
        </span>
        <h1 className="text-4xl md:text-6xl font-bold text-slate-900 leading-[1.05] tracking-tight">
          Tạo ảnh & video AI{" "}
          <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
            mượt như Grok
          </span>
          ,{" "}
          <span className="bg-gradient-to-r from-cyan-600 to-emerald-500 bg-clip-text text-transparent">
            đơn giản như REST API
          </span>
        </h1>
        <p className="mt-5 text-lg text-slate-600 max-w-2xl mx-auto">
          Tích hợp Grok AI image/video vào app của bạn qua REST API. Không tự quản
          lý browser, không solve captcha, không lo cookie expiry. Có cả LLM
          Gateway + Flow tools đi kèm.
        </p>
        <div className="mt-8 flex gap-3 justify-center flex-wrap">
          <Link
            to="/try/image"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-6 py-3 text-base font-semibold shadow-lg shadow-violet-200 hover:shadow-xl hover:from-violet-700 hover:to-fuchsia-700 transition"
          >
            <PlayCircle size={18} /> Thử tạo ảnh miễn phí
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-semibold text-slate-800 border border-slate-200 hover:bg-slate-50 transition"
          >
            Đăng ký <ArrowRight size={16} />
          </Link>
        </div>
        <div className="mt-5 flex items-center justify-center gap-1 text-xs text-slate-500">
          <Check size={12} className="text-emerald-500" /> Không cần thẻ tín dụng
          <span className="mx-2 text-slate-300">·</span>
          <Check size={12} className="text-emerald-500" /> 2 ảnh miễn phí ngay
          <span className="mx-2 text-slate-300">·</span>
          <Check size={12} className="text-emerald-500" /> Đăng ký = 10 ảnh/ngày
        </div>
      </section>

      {/* ── Modules / Tabs ────────────────────────────────────────────── */}
      <section id="modules" className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <p className="text-xs uppercase tracking-wider text-violet-600 font-semibold">
            4 module — 1 platform
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-1">
            Cứ chọn, không phải chuyển tool
          </h2>
          <p className="mt-2 text-slate-600 max-w-2xl mx-auto">
            Mỗi tính năng có entry point riêng. Đăng nhập xong dùng được hết — quota
            theo gói. Anonymous được thử Grok Image.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULES.map((m) => {
            const t = TONE_BG[m.tone];
            return (
              <Link
                key={m.label}
                to={m.to}
                className={`group rounded-xl bg-white p-5 ring-1 ${t.ring} hover:shadow-lg hover:-translate-y-0.5 transition flex flex-col`}
              >
                <div className={`w-11 h-11 rounded-lg ${t.bg} ${t.text} flex items-center justify-center mb-3`}>
                  <m.icon size={22} />
                </div>
                <h3 className="font-bold text-slate-900">{m.label}</h3>
                <p className="text-sm text-slate-600 mt-1 leading-snug flex-1">{m.desc}</p>
                <p className={`text-xs font-semibold ${t.text} mt-3 inline-flex items-center gap-1`}>
                  {m.publicCta}
                  <ArrowRight size={12} className="group-hover:translate-x-0.5 transition" />
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Try-it strip — anon CTA ─────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-8">
        <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 text-white p-6 sm:p-8 shadow-xl flex flex-col sm:flex-row items-center gap-5">
          <div className="flex-1 text-center sm:text-left">
            <p className="text-xs uppercase tracking-widest opacity-80 font-bold">Thử trước — không cần tài khoản</p>
            <h3 className="text-2xl font-bold mt-1">Generate 2 ảnh AI ngay trong trình duyệt</h3>
            <p className="text-sm opacity-90 mt-1">
              Mở <code className="font-mono text-xs bg-white/15 px-1.5 py-0.5 rounded">/try/image</code> →
              nhập prompt → bấm tạo. IP-rate-limit 2 lần/24h, hết thì đăng ký.
            </p>
          </div>
          <Link
            to="/try/image"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white text-violet-700 px-5 py-2.5 text-sm font-bold shadow-lg hover:bg-violet-50 transition flex-shrink-0"
          >
            <Sparkles size={14} /> Thử ngay
          </Link>
        </div>
      </section>

      {/* ── Features grid ─────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900">Vì sao chọn {brandName}</h2>
          <p className="mt-2 text-slate-600">Built for builders — không chỉ là wrapper.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <FeatureCard icon={<ImageIcon size={20} />} tone="violet"
            title="Image AI chất lượng cao"
            desc="Aurora · Grok-2 · Grok-3. Aspect 1:1, 16:9, 9:16, 4:3, 3:4. Quality mode trên Pro." />
          <FeatureCard icon={<Video size={20} />} tone="fuchsia"
            title="Video 720p sẵn sàng"
            desc="Text-to-video + Image-to-video. Duration 3/6/9/15s. Fun + Custom mode." />
          <FeatureCard icon={<Cpu size={20} />} tone="cyan"
            title="LLM Gateway tích hợp"
            desc="Multi-provider routing: OpenAI · Gemini · Claude. Pool + key rotation." />
          <FeatureCard icon={<Zap size={20} />} tone="amber"
            title="REST API đơn giản"
            desc="POST → poll → tải file. Webhook callback. SDK curl / JS / Python sẵn." />
          <FeatureCard icon={<Shield size={20} />} tone="emerald"
            title="Quota + Audit Log"
            desc="Rate limit phút + cap ngày. Audit log đầy đủ. Multi-tenant per-domain." />
          <FeatureCard icon={<Code2 size={20} />} tone="rose"
            title="Self-hosted friendly"
            desc="Docker compose 1-shot. Backup restic + Google Drive sẵn. SSH deploy." />
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────── */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <p className="text-xs uppercase tracking-wider text-violet-600 font-semibold">Pricing</p>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-1">Bảng giá đơn giản</h2>
          <p className="mt-2 text-slate-600">Chọn gói phù hợp. Nâng cấp / hạ cấp bất kỳ lúc nào.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((t) => <PricingCard key={t.code} tier={t} />)}
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          Giá đã bao gồm VAT. Thanh toán mỗi tháng. Hủy bất cứ lúc nào · <Link to="/pricing" className="text-violet-600 hover:underline">Xem chi tiết entitlements</Link>
        </p>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 py-12 text-center">
        <Crown className="inline text-amber-500" size={28} />
        <h3 className="text-2xl font-bold text-slate-900 mt-2">Sẵn sàng build production?</h3>
        <p className="text-slate-600 mt-2">
          Đăng ký 30 giây. Tạo API key, copy vào app của bạn, ship.
        </p>
        <div className="mt-5 flex justify-center gap-3 flex-wrap">
          <Link to="/register" className="btn-primary px-6 py-3 text-base">Đăng ký miễn phí</Link>
          <Link to="/try/image" className="btn-ghost px-6 py-3 text-base border border-slate-200">Thử trước đã</Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid sm:grid-cols-3 gap-6 text-sm">
            <div>
              <Link to="/" className="font-bold text-lg inline-flex items-center gap-1.5">
                <Wand2 size={18} className="text-violet-600" />
                <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                  {brandName}
                </span>
              </Link>
              <p className="text-xs text-slate-500 mt-2">
                AI image/video API + LLM Gateway. Self-hosted ready.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-700 mb-1.5">Sản phẩm</p>
              <ul className="space-y-1 text-slate-600">
                <li><Link to="/try/image" className="hover:text-violet-600">Thử Grok Image</Link></li>
                <li><Link to="/pricing" className="hover:text-violet-600">Bảng giá</Link></li>
                <li><a href="#modules" className="hover:text-violet-600">Tính năng</a></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-700 mb-1.5">Tài khoản</p>
              <ul className="space-y-1 text-slate-600">
                <li><Link to="/login" className="hover:text-violet-600">Đăng nhập</Link></li>
                <li><Link to="/register" className="hover:text-violet-600">Đăng ký</Link></li>
                <li><Link to="/terms" className="hover:text-violet-600">Điều khoản</Link></li>
                <li><Link to="/privacy" className="hover:text-violet-600">Bảo mật</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} {brandName}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Sub ───────────────────────────────────────────────────────────────────

function FeatureCard({
  icon, title, desc, tone,
}: { icon: React.ReactNode; title: string; desc: string; tone: keyof typeof FC_TONE }) {
  const t = FC_TONE[tone];
  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200 hover:shadow-md transition">
      <div className={`w-10 h-10 rounded-lg ${t.bg} ${t.text} flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 mt-1 leading-snug">{desc}</p>
    </div>
  );
}

const FC_TONE = {
  violet:  { bg: "bg-violet-50",  text: "text-violet-600" },
  fuchsia: { bg: "bg-fuchsia-50", text: "text-fuchsia-600" },
  cyan:    { bg: "bg-cyan-50",    text: "text-cyan-600" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-600" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  rose:    { bg: "bg-rose-50",    text: "text-rose-600" },
};

function PricingCard({ tier }: { tier: Tier }) {
  const priceDisplay =
    tier.priceLabel ??
    (tier.priceVnd === 0 ? "Miễn phí" : tier.priceVnd ? formatVnd(tier.priceVnd) : "Liên hệ");

  return (
    <div
      className={`relative rounded-xl bg-white p-5 flex flex-col transition ${
        tier.highlight
          ? "ring-2 ring-violet-500 shadow-xl shadow-violet-100 scale-[1.02]"
          : "ring-1 ring-slate-200 hover:shadow-md"
      }`}
    >
      {tier.highlight && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white tracking-wider">
          PHỔ BIẾN
        </span>
      )}
      <h3 className="text-xl font-bold text-slate-900">{tier.name}</h3>
      <p className="text-xs text-slate-500 mt-1 min-h-[2.5rem]">{tier.description}</p>

      <div className="mt-3">
        <span className={`text-3xl font-bold ${tier.highlight ? "text-violet-700" : "text-slate-900"}`}>{priceDisplay}</span>
        {tier.priceVnd && tier.priceVnd > 0 && (
          <span className="text-sm text-slate-500"> / tháng</span>
        )}
      </div>

      <ul className="mt-4 space-y-1.5 text-sm flex-1">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-slate-700">
            <Check size={15} className="text-emerald-500 mt-0.5 flex-shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 pt-3 border-t border-slate-100 space-y-1 text-xs">
        {tier.limits.map((l) => (
          <div key={l.label} className="flex justify-between text-slate-600">
            <span>{l.label}</span>
            <span className="font-mono font-semibold text-slate-900">{l.value}</span>
          </div>
        ))}
      </div>

      <Link
        to={tier.ctaTo}
        className={`mt-5 block text-center px-4 py-2.5 rounded-lg font-semibold transition ${
          tier.highlight
            ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 shadow-md"
            : "bg-slate-100 text-slate-900 hover:bg-slate-200"
        }`}
      >
        {tier.cta}
      </Link>
    </div>
  );
}
