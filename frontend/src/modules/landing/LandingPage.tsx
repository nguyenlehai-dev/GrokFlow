import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check, Image as ImageIcon, Video, Zap, Shield, Code2, Sparkles,
  Wand2, Scissors, Cpu, ArrowRight, PlayCircle, Crown, Star,
  Globe, BookOpen, Terminal, Lock, Webhook, Layers, BarChart3,
  Users, Briefcase, Palette, ChevronDown, Plus, Minus, Github,
  Clock, Rocket, Settings,
} from "lucide-react";
import { useDomainStore } from "@/core/domain/store";

// ─── Pricing tiers (in sync with backend/entitlements/catalog.py) ─────────

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
    code: "free", name: "Free", priceVnd: 0,
    description: "Dùng thử miễn phí — tạo ảnh chất lượng cơ bản",
    features: [
      "Tạo job ảnh", "Aspect ratio cơ bản",
      "2 lượt thử /try/image không cần đăng ký",
    ],
    limits: [
      { label: "Job mỗi ngày", value: "10" },
      { label: "Job mỗi tháng", value: "100" },
      { label: "API Key", value: "1" },
      { label: "Profile", value: "1" },
    ],
    cta: "Đăng ký miễn phí", ctaTo: "/register",
  },
  {
    code: "basic", name: "Basic", priceVnd: 199000,
    description: "Cá nhân + freelancer — ảnh + video cơ bản",
    features: [
      "Tạo ảnh + video", "Image-to-image",
      "Fun mode", "Full aspect ratios", "Hỗ trợ Discord",
    ],
    limits: [
      { label: "Job mỗi ngày", value: "50" },
      { label: "Job mỗi tháng", value: "1,000" },
      { label: "API Key", value: "2" },
      { label: "Profile", value: "2" },
    ],
    cta: "Chọn gói Basic", ctaTo: "/register?plan=basic",
  },
  {
    code: "pro", name: "Pro", priceVnd: 599000,
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
    cta: "Chọn gói Pro", ctaTo: "/register?plan=pro",
  },
  {
    code: "enterprise", name: "Enterprise",
    priceVnd: null, priceLabel: "Liên hệ",
    description: "Doanh nghiệp — không giới hạn, hỗ trợ ưu tiên",
    features: [
      "Tất cả tính năng Pro", "Spicy mode 18+",
      "SLA + Hỗ trợ 24/7", "Custom plan",
      "Multi-domain branding", "Account manager",
    ],
    limits: [
      { label: "Job mỗi ngày", value: "2,000" },
      { label: "Job mỗi tháng", value: "50,000" },
      { label: "API Key", value: "20" },
      { label: "Profile", value: "20" },
    ],
    cta: "Liên hệ Sale", ctaTo: "/register?plan=enterprise",
  },
];

const formatVnd = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + "₫";

// ─── Page ──────────────────────────────────────────────────────────────────

export function LandingPage() {
  const brandName = useDomainStore((s) => s.config?.brand_name) ?? "GrokFlow";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <TopNav brandName={brandName} />
      <Hero />
      <TrustStrip />
      <ModulesSection />
      <HowItWorksSection />
      <UseCasesSection />
      <StatsSection />
      <FeaturesGridSection brandName={brandName} />
      <PricingSection />
      <FaqSection />
      <FinalCtaSection />
      <Footer brandName={brandName} />
    </div>
  );
}

// ─── Top nav ───────────────────────────────────────────────────────────────

function TopNav({ brandName }: { brandName: string }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header
      className={`sticky top-0 z-30 transition ${
        scrolled
          ? "bg-white/85 backdrop-blur-lg border-b border-slate-200/70"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link to="/" className="text-xl font-bold inline-flex items-center gap-1.5">
          <Wand2 size={22} className="text-violet-600" />
          <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            {brandName}
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-sm text-slate-600">
          <a href="#modules" className="hover:text-violet-600">Tính năng</a>
          <a href="#how" className="hover:text-violet-600">Cách dùng</a>
          <a href="#pricing" className="hover:text-violet-600">Bảng giá</a>
          <a href="#faq" className="hover:text-violet-600">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/try/image"
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-violet-700 hover:bg-violet-50"
          >
            <Sparkles size={13} /> Thử miễn phí
          </Link>
          <Link to="/login" className="text-sm text-slate-600 hover:text-slate-900 px-2.5 py-1.5 hidden sm:inline">
            Đăng nhập
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-4 py-2 text-sm font-semibold hover:from-violet-700 hover:to-fuchsia-700 shadow-sm"
          >
            Đăng ký
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Decorative gradient blobs */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-violet-300/30 rounded-full blur-3xl" />
        <div className="absolute -top-12 right-0 w-[28rem] h-[28rem] bg-fuchsia-300/30 rounded-full blur-3xl" />
        <div className="absolute top-72 left-1/3 w-80 h-80 bg-cyan-300/20 rounded-full blur-3xl" />
      </div>
      <div className="max-w-6xl mx-auto px-4 py-16 sm:py-24 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-violet-200 bg-white/70 backdrop-blur-sm text-violet-700 text-xs font-semibold">
          <Star size={12} className="text-amber-500" />
          v0.5 ra mắt · Public try-image · LLM Gateway · Flow tools
        </span>
        <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.05] tracking-tight max-w-4xl mx-auto">
          Tạo ảnh & video AI{" "}
          <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
            mượt như Grok
          </span>
          <br />
          <span className="bg-gradient-to-r from-cyan-600 to-emerald-500 bg-clip-text text-transparent">
            đơn giản như REST API
          </span>
        </h1>
        <p className="mt-5 text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Một platform cho mọi nhu cầu sinh AI: image, video, video editing,
          LLM gateway đa-provider. Không tự lo browser, không solve captcha,
          không lo cookie expiry.
        </p>
        <div className="mt-8 flex gap-3 justify-center flex-wrap">
          <Link
            to="/try/image"
            className="group inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-6 py-3.5 text-base font-semibold shadow-lg shadow-violet-200 hover:shadow-xl hover:from-violet-700 hover:to-fuchsia-700 transition"
          >
            <PlayCircle size={18} /> Thử tạo ảnh miễn phí
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition" />
          </Link>
          <Link
            to="#how"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3.5 text-base font-semibold text-slate-800 border border-slate-200 hover:bg-slate-50 transition"
          >
            <BookOpen size={16} /> Xem cách dùng
          </Link>
        </div>
        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-slate-500 flex-wrap">
          <Pill>✓ Không cần thẻ tín dụng</Pill>
          <Pill>✓ 2 ảnh miễn phí ngay trình duyệt</Pill>
          <Pill>✓ Đăng ký = 10 job / ngày</Pill>
        </div>

        {/* Mock product preview */}
        <div className="mt-12 max-w-4xl mx-auto">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
      {children}
    </span>
  );
}

function ProductPreview() {
  // A stylized "screenshot" of the playground UI — pure CSS, no real asset.
  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 via-fuchsia-500/20 to-cyan-500/20 rounded-2xl blur-2xl -z-10" />
      <div className="rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-200 bg-slate-50">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 text-xs text-slate-500 font-mono">/try/image</span>
        </div>
        {/* Body */}
        <div className="grid sm:grid-cols-2 gap-0 text-left">
          <div className="p-5 border-r border-slate-100 space-y-3">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Prompt</div>
            <div className="font-mono text-sm text-slate-700 bg-slate-50 rounded-md p-3 border border-slate-200 leading-relaxed">
              A dragon flying over Ha Long Bay at sunset,<br />
              <span className="text-violet-600">watercolor style</span>, cinematic lighting
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {["1:1", "16:9", "9:16"].map((a, i) => (
                <span key={a} className={`text-[11px] px-2 py-0.5 rounded-md ${i === 1 ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-700"}`}>
                  {a}
                </span>
              ))}
            </div>
            <button className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white py-2 rounded-md text-sm font-semibold inline-flex items-center justify-center gap-1.5">
              <Sparkles size={14} /> Tạo ảnh
            </button>
            <p className="text-[11px] text-emerald-600 font-medium">✓ Còn 2/2 lượt thử miễn phí</p>
          </div>
          <div className="aspect-square sm:aspect-auto bg-gradient-to-br from-amber-200 via-rose-300 to-violet-400 relative">
            <div className="absolute bottom-3 left-3 right-3 text-[10px] text-white/90 font-mono bg-black/30 backdrop-blur-sm rounded px-2 py-1">
              <ImageIcon size={9} className="inline" /> grok-2 · 15.3s · 1024×576
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Trust strip ───────────────────────────────────────────────────────────

function TrustStrip() {
  const items = [
    { icon: Rocket, label: "Self-hosted ready" },
    { icon: Lock, label: "JWT + API Key auth" },
    { icon: Webhook, label: "Webhook callback" },
    { icon: BarChart3, label: "Audit log + stats" },
    { icon: Globe, label: "Multi-tenant per-domain" },
    { icon: Code2, label: "REST + OpenAPI" },
  ];
  return (
    <section className="border-y border-slate-200 bg-slate-50/50">
      <div className="max-w-6xl mx-auto px-4 py-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 text-xs text-slate-600">
        {items.map((it) => (
          <div key={it.label} className="inline-flex items-center gap-1.5 justify-center">
            <it.icon size={14} className="text-violet-500" />
            <span className="font-medium">{it.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Modules ───────────────────────────────────────────────────────────────

const MODULES = [
  {
    label: "Grok Image",
    desc: "Aurora · Grok-2 · Grok-3 model. Full aspect ratios. Speed / Quality mode.",
    icon: ImageIcon, tone: "violet",
    to: "/try/image", ctaText: "Thử ngay",
    badge: "Public",
    features: ["Aurora model", "Image-to-image", "5 aspect ratios", "Quality mode (Pro)"],
  },
  {
    label: "Grok Video",
    desc: "Text-to-video & image-to-video. Render 480p/720p. Duration 3-15s.",
    icon: Video, tone: "fuchsia",
    to: "/register?plan=basic", ctaText: "Cần Basic",
    badge: "199k+",
    features: ["Text-to-video", "Image-to-video", "Fun + Custom mode", "Duration tới 15s"],
  },
  {
    label: "Flow Tools",
    desc: "Cut / merge / resize / extract audio. Xử lý local, không cần Adobe.",
    icon: Scissors, tone: "amber",
    to: "/register", ctaText: "Trong app",
    features: ["Cut video", "Merge / replace audio", "Resize + crop", "Extract frames"],
  },
  {
    label: "LLM Gateway",
    desc: "1 API key — route giữa OpenAI, Gemini, Claude. Pool + rotation tự động.",
    icon: Cpu, tone: "cyan",
    to: "/register?plan=pro", ctaText: "Cần Pro",
    badge: "v1",
    features: ["Multi-provider", "Pool + key rotation", "Per-function rate limit", "Async + sync mode"],
  },
] as const;

function ModulesSection() {
  return (
    <section id="modules" className="max-w-6xl mx-auto px-4 py-20">
      <SectionHeader
        eyebrow="4 module · 1 platform"
        title="Mọi thứ AI bạn cần, không phải chuyển tool"
        subtitle="Đăng nhập một lần dùng được hết. Quota theo gói. Anonymous được thử Grok Image trực tiếp trên web."
      />
      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MODULES.map((m) => {
          const t = TONE[m.tone];
          return (
            <Link
              key={m.label}
              to={m.to}
              className={`group rounded-xl bg-white p-5 ring-1 ${t.ring} hover:shadow-xl hover:-translate-y-1 transition flex flex-col`}
            >
              <div className="flex items-center justify-between">
                <div className={`w-11 h-11 rounded-lg ${t.bg} ${t.text} flex items-center justify-center`}>
                  <m.icon size={22} />
                </div>
                {m.badge && (
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${t.bg} ${t.text}`}>
                    {m.badge}
                  </span>
                )}
              </div>
              <h3 className="font-bold text-slate-900 mt-3">{m.label}</h3>
              <p className="text-sm text-slate-600 mt-1 leading-snug">{m.desc}</p>
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                {m.features.map((f) => (
                  <li key={f} className="flex items-start gap-1">
                    <Check size={12} className="text-emerald-500 mt-0.5 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <p className={`mt-4 text-xs font-semibold ${t.text} inline-flex items-center gap-1`}>
                {m.ctaText} <ArrowRight size={11} className="group-hover:translate-x-0.5 transition" />
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── How it works ──────────────────────────────────────────────────────────

function HowItWorksSection() {
  const steps = [
    {
      n: 1, icon: Sparkles, title: "Thử miễn phí ngay",
      desc: "Vào /try/image, gõ prompt → tạo ảnh. 2 lượt/IP, không cần email.",
      to: "/try/image",
    },
    {
      n: 2, icon: Users, title: "Đăng ký 30 giây",
      desc: "Email + password, chọn gói (hoặc dùng Free). Nhận quota theo gói.",
      to: "/register",
    },
    {
      n: 3, icon: Terminal, title: "Tạo API Key",
      desc: "Trong dashboard, click Tạo API Key. Copy key uxpm_live_..., paste vào app của bạn.",
      to: "/register",
    },
    {
      n: 4, icon: Rocket, title: "Ship production",
      desc: "POST /api/jobs với Bearer key → poll status → tải file. Webhook nếu cần.",
      to: "/register",
    },
  ];
  return (
    <section id="how" className="bg-gradient-to-b from-violet-50/40 to-white border-y border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-20">
        <SectionHeader
          eyebrow="Cách dùng · 4 bước"
          title="Từ zero đến production trong 5 phút"
          subtitle="Không phải setup browser, không phải mua proxy. GrokFlow lo phần khó."
        />
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((s) => (
            <div
              key={s.n}
              className="relative rounded-xl bg-white p-5 ring-1 ring-slate-200"
            >
              <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white flex items-center justify-center font-bold shadow-md">
                {s.n}
              </div>
              <s.icon size={22} className="text-violet-600" />
              <h3 className="font-bold mt-3">{s.title}</h3>
              <p className="text-sm text-slate-600 mt-1 leading-snug">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Code preview */}
        <div className="mt-10 max-w-3xl mx-auto rounded-xl bg-slate-900 text-slate-100 p-5 shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 mb-3 text-xs text-slate-400 font-mono">
            <Terminal size={12} /> curl — tạo job ảnh
          </div>
          <pre className="text-[12px] leading-relaxed overflow-x-auto">
            <code>
              <span className="text-violet-300">curl</span> -X POST{" "}
              <span className="text-emerald-300">https://your-domain/api/jobs</span> \{"\n"}
              {"  "}-H <span className="text-amber-300">"Authorization: Bearer uxpm_live_..."</span> \{"\n"}
              {"  "}-H <span className="text-amber-300">"Content-Type: application/json"</span> \{"\n"}
              {"  "}-d{" "}
              <span className="text-amber-300">{`'{`}</span>{"\n"}
              <span className="text-amber-300">{`    "provider": "grok",`}</span>{"\n"}
              <span className="text-amber-300">{`    "job_type": "image",`}</span>{"\n"}
              <span className="text-amber-300">{`    "prompt": "A dragon over Ha Long Bay",`}</span>{"\n"}
              <span className="text-amber-300">{`    "options": { "aspect": "16:9" }`}</span>{"\n"}
              <span className="text-amber-300">{`  }'`}</span>
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}

// ─── Use cases ─────────────────────────────────────────────────────────────

const USE_CASES = [
  {
    icon: Briefcase, tone: "violet",
    title: "Agency / Studio",
    desc: "Một dashboard cho cả team. Quota theo gói, audit log đầy đủ, tách per-client qua domain.",
    items: ["Multi-domain branding", "Per-domain audit log", "Role-based access", "Webhook tích hợp CRM"],
  },
  {
    icon: Code2, tone: "cyan",
    title: "Developer / Indie hacker",
    desc: "REST API sạch, SDK curl/JS/Python. Quota minh bạch, không bị throttle bất ngờ.",
    items: ["OpenAPI / Swagger", "Bearer API key", "Webhook callback", "Self-host được"],
  },
  {
    icon: Palette, tone: "fuchsia",
    title: "Content creator",
    desc: "Tạo thumbnails, video ngắn cho social. Free trial sẵn, nâng cấp Basic là đủ dùng.",
    items: ["Thumbnail YouTube", "Reels / Shorts", "Banner ads", "Story Instagram"],
  },
];

function UseCasesSection() {
  return (
    <section className="max-w-6xl mx-auto px-4 py-20">
      <SectionHeader
        eyebrow="Đối tượng phù hợp"
        title="Xây bởi builders, cho builders"
      />
      <div className="mt-12 grid md:grid-cols-3 gap-5">
        {USE_CASES.map((u) => {
          const t = TONE[u.tone];
          return (
            <div key={u.title} className={`rounded-xl p-6 ring-1 ${t.ring} ${t.bg}/40 hover:shadow-md transition`}>
              <div className={`w-11 h-11 rounded-lg bg-white ${t.text} flex items-center justify-center mb-3 shadow-sm`}>
                <u.icon size={22} />
              </div>
              <h3 className="font-bold text-slate-900">{u.title}</h3>
              <p className="text-sm text-slate-600 mt-1 leading-snug">{u.desc}</p>
              <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
                {u.items.map((i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <Check size={14} className={`${t.text} mt-0.5 flex-shrink-0`} /> {i}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Stats ─────────────────────────────────────────────────────────────────

function StatsSection() {
  const stats = [
    { value: "<15s", label: "Render ảnh trung bình" },
    { value: "99.9%", label: "Uptime backend" },
    { value: "4", label: "Module tích hợp" },
    { value: "5+", label: "Aspect ratios" },
  ];
  return (
    <section className="bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 text-white">
      <div className="max-w-6xl mx-auto px-4 py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-3xl md:text-4xl font-bold">{s.value}</div>
              <div className="text-xs opacity-80 mt-1 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Features grid ─────────────────────────────────────────────────────────

const FEATURES = [
  { icon: ImageIcon,  tone: "violet",  title: "Image AI chất lượng cao", desc: "Aurora · Grok-2 · Grok-3. Aspect 1:1, 16:9, 9:16, 4:3, 3:4. Quality mode trên Pro." },
  { icon: Video,      tone: "fuchsia", title: "Video 720p sẵn sàng",    desc: "Text-to-video + Image-to-video. Duration 3/6/9/15s. Fun + Custom mode." },
  { icon: Cpu,        tone: "cyan",    title: "LLM Gateway",            desc: "Multi-provider routing: OpenAI · Gemini · Claude. Pool + key rotation tự động." },
  { icon: Scissors,   tone: "amber",   title: "Flow video editing",     desc: "Cut · merge · resize · audio. Xử lý local cho privacy + tốc độ." },
  { icon: Zap,        tone: "rose",    title: "REST API đơn giản",      desc: "POST → poll → tải file. Webhook callback. SDK curl / JS / Python sẵn." },
  { icon: Shield,     tone: "emerald", title: "Quota + Audit Log",      desc: "Rate limit phút + cap ngày. Audit log đầy đủ. Multi-tenant per-domain." },
  { icon: Webhook,    tone: "violet",  title: "Webhook callback",       desc: "Bắn HTTP POST tới app của bạn khi job xong. Signed payload HMAC-SHA256." },
  { icon: Lock,       tone: "slate",   title: "Self-hosted friendly",   desc: "Docker compose 1-shot. Backup restic + Google Drive sẵn. SSH deploy." },
  { icon: BarChart3,  tone: "cyan",    title: "Dashboard + analytics",  desc: "Stats theo job/profile/domain. Revenue chart. Per-tenant breakdown." },
];

function FeaturesGridSection({ brandName }: { brandName: string }) {
  return (
    <section className="max-w-6xl mx-auto px-4 py-20">
      <SectionHeader
        eyebrow="Tính năng đầy đủ"
        title={`Vì sao chọn ${brandName}`}
        subtitle="Built for builders — không chỉ là wrapper API. Quản trị, observability, multi-tenant đều có sẵn."
      />
      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((f) => {
          const t = TONE[f.tone];
          return (
            <div key={f.title} className="rounded-xl bg-white p-5 ring-1 ring-slate-200 hover:shadow-md hover:-translate-y-0.5 transition">
              <div className={`w-10 h-10 rounded-lg ${t.bg} ${t.text} flex items-center justify-center mb-3`}>
                <f.icon size={20} />
              </div>
              <h3 className="font-bold text-slate-900">{f.title}</h3>
              <p className="text-sm text-slate-600 mt-1 leading-snug">{f.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Pricing ───────────────────────────────────────────────────────────────

function PricingSection() {
  return (
    <section id="pricing" className="bg-gradient-to-b from-slate-50 to-white border-y border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-20">
        <SectionHeader
          eyebrow="Pricing"
          title="Bảng giá đơn giản, minh bạch"
          subtitle="Chọn gói phù hợp với khối lượng công việc. Nâng cấp / hạ cấp bất cứ lúc nào."
        />
        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((t) => <PricingCard key={t.code} tier={t} />)}
        </div>
        <p className="mt-8 text-center text-sm text-slate-500">
          Giá đã bao gồm VAT. Thanh toán mỗi tháng (hoặc năm để được giảm). Hủy bất cứ lúc nào ·{" "}
          <Link to="/pricing" className="text-violet-600 hover:underline font-medium">
            Xem chi tiết entitlements
          </Link>
        </p>
      </div>
    </section>
  );
}

function PricingCard({ tier }: { tier: Tier }) {
  const priceDisplay =
    tier.priceLabel ??
    (tier.priceVnd === 0 ? "Miễn phí" : tier.priceVnd ? formatVnd(tier.priceVnd) : "Liên hệ");

  return (
    <div
      className={`relative rounded-2xl bg-white p-5 flex flex-col transition ${
        tier.highlight
          ? "ring-2 ring-violet-500 shadow-2xl shadow-violet-200 lg:scale-[1.03] z-10"
          : "ring-1 ring-slate-200 hover:shadow-lg"
      }`}
    >
      {tier.highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 text-[10px] font-bold rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white tracking-wider shadow-md">
          PHỔ BIẾN NHẤT
        </span>
      )}
      <h3 className="text-xl font-bold text-slate-900">{tier.name}</h3>
      <p className="text-xs text-slate-500 mt-1 min-h-[2.5rem]">{tier.description}</p>

      <div className="mt-3">
        <span className={`text-3xl font-bold ${tier.highlight ? "text-violet-700" : "text-slate-900"}`}>
          {priceDisplay}
        </span>
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

// ─── FAQ ───────────────────────────────────────────────────────────────────

const FAQ: { q: string; a: string }[] = [
  {
    q: "Anonymous được tạo bao nhiêu ảnh?",
    a: "2 ảnh / IP / 24h trên /try/image. Hết lượt → đăng ký miễn phí để có 10 ảnh/ngày (gói Free).",
  },
  {
    q: "Có thể self-host không?",
    a: "Có. GrokFlow ship docker-compose.yml + setup scripts đầy đủ. Backup restic + Google Drive sẵn. Cần VPS 4GB RAM, Docker 24+, Ubuntu 22.04+.",
  },
  {
    q: "Hủy gói có hoàn tiền không?",
    a: "Hủy giữa chu kỳ vẫn dùng được tới hết chu kỳ, không hoàn tiền pro-rata. Sau đó tự rớt về Free plan, dữ liệu giữ nguyên.",
  },
  {
    q: "API key có lộ thì sao?",
    a: "Vào dashboard /api-keys → bấm Revoke ngay. Key bị revoke trả 401 lập tức. Recommended: 1 key / môi trường (dev / prod / CI) để cô lập.",
  },
  {
    q: "Quality mode khác Speed thế nào?",
    a: "Speed = ưu tiên thời gian (~15s). Quality = ưu tiên chi tiết (~45s, cần Pro plan). Aspect + size giữ nguyên.",
  },
  {
    q: "Có hỗ trợ video dài hơn 15s không?",
    a: "Hiện tại tối đa 15s (giới hạn Grok). Cho video dài, dùng Flow Tools cắt + merge nhiều clip 15s lại.",
  },
  {
    q: "LLM Gateway gọi được model nào?",
    a: "OpenAI (GPT-4o, o1), Anthropic Claude, Google Gemini, Grok LLM. Pool tự rotate key khi gặp rate-limit.",
  },
  {
    q: "Webhook signing thế nào?",
    a: "HMAC-SHA256 dùng webhook_secret bạn cấu hình. Header X-Signature trả về dạng sha256=hex. Verify với secret server-side.",
  },
];

function FaqSection() {
  return (
    <section id="faq" className="max-w-4xl mx-auto px-4 py-20">
      <SectionHeader
        eyebrow="FAQ"
        title="Câu hỏi thường gặp"
      />
      <div className="mt-10 space-y-3">
        {FAQ.map((it, i) => <FaqItem key={i} q={it.q} a={it.a} />)}
      </div>
    </section>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition text-left"
      >
        <span className="font-semibold text-slate-800">{q}</span>
        {open ? <Minus size={16} className="text-violet-600 flex-shrink-0" /> : <Plus size={16} className="text-slate-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
          {a}
        </div>
      )}
    </div>
  );
}

// ─── Final CTA ─────────────────────────────────────────────────────────────

function FinalCtaSection() {
  return (
    <section className="max-w-4xl mx-auto px-4 py-20 text-center">
      <div className="rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 text-white p-10 shadow-2xl">
        <Crown size={32} className="mx-auto text-amber-200" />
        <h2 className="text-3xl md:text-4xl font-bold mt-4">Sẵn sàng build production?</h2>
        <p className="mt-3 opacity-90 max-w-xl mx-auto">
          Đăng ký 30 giây. Free tier không cần thẻ. Có API key ngay, copy vào app
          của bạn, ship trong cùng buổi chiều.
        </p>
        <div className="mt-7 flex justify-center gap-3 flex-wrap">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-white text-violet-700 px-6 py-3 text-base font-bold hover:bg-violet-50 shadow-lg"
          >
            Đăng ký miễn phí <ArrowRight size={16} />
          </Link>
          <Link
            to="/try/image"
            className="inline-flex items-center gap-2 rounded-lg bg-white/15 backdrop-blur-sm border border-white/40 text-white px-6 py-3 text-base font-semibold hover:bg-white/25"
          >
            <Sparkles size={16} /> Thử trước đã
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────

function Footer({ brandName }: { brandName: string }) {
  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid sm:grid-cols-4 gap-8 text-sm">
          <div className="sm:col-span-1">
            <Link to="/" className="font-bold text-lg inline-flex items-center gap-1.5">
              <Wand2 size={18} className="text-violet-400" />
              <span className="text-white">{brandName}</span>
            </Link>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              AI image/video API + LLM Gateway + Flow tools. Self-hosted ready.
              Made in Vietnam.
            </p>
          </div>
          <FooterCol title="Sản phẩm">
            <FooterLink to="/try/image">Thử Grok Image</FooterLink>
            <FooterLink to="/pricing">Bảng giá</FooterLink>
            <FooterLink href="#modules">Tính năng</FooterLink>
            <FooterLink href="#how">Cách dùng</FooterLink>
          </FooterCol>
          <FooterCol title="Tài khoản">
            <FooterLink to="/login">Đăng nhập</FooterLink>
            <FooterLink to="/register">Đăng ký</FooterLink>
            <FooterLink to="/pricing">Plans + entitlements</FooterLink>
            <FooterLink href="#faq">FAQ</FooterLink>
          </FooterCol>
          <FooterCol title="Hỗ trợ">
            <FooterLink to="/terms">Điều khoản dịch vụ</FooterLink>
            <FooterLink to="/privacy">Chính sách bảo mật</FooterLink>
            <FooterLink href="mailto:support@grokflow.io">support@grokflow.io</FooterLink>
          </FooterCol>
        </div>
        <div className="mt-10 pt-6 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
          <span>© {new Date().getFullYear()} {brandName}. All rights reserved.</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            All systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-white mb-2">{title}</p>
      <ul className="space-y-1.5 text-slate-400">{children}</ul>
    </div>
  );
}

function FooterLink({ to, href, children }: { to?: string; href?: string; children: React.ReactNode }) {
  if (to) return <li><Link to={to} className="hover:text-violet-400 transition">{children}</Link></li>;
  return <li><a href={href} className="hover:text-violet-400 transition">{children}</a></li>;
}

// ─── Reusable section header ───────────────────────────────────────────────

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <p className="text-xs uppercase tracking-wider text-violet-600 font-bold">{eyebrow}</p>
      <h2 className="mt-2 text-3xl md:text-4xl font-bold text-slate-900 leading-tight">{title}</h2>
      {subtitle && <p className="mt-3 text-slate-600">{subtitle}</p>}
    </div>
  );
}

// ─── Tone palette (shared) ─────────────────────────────────────────────────

const TONE: Record<string, { bg: string; text: string; ring: string }> = {
  violet:  { bg: "bg-violet-50",  text: "text-violet-600",  ring: "ring-violet-200"  },
  fuchsia: { bg: "bg-fuchsia-50", text: "text-fuchsia-600", ring: "ring-fuchsia-200" },
  cyan:    { bg: "bg-cyan-50",    text: "text-cyan-600",    ring: "ring-cyan-200"    },
  amber:   { bg: "bg-amber-50",   text: "text-amber-600",   ring: "ring-amber-200"   },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", ring: "ring-emerald-200" },
  rose:    { bg: "bg-rose-50",    text: "text-rose-600",    ring: "ring-rose-200"    },
  slate:   { bg: "bg-slate-100",  text: "text-slate-700",   ring: "ring-slate-200"   },
};
