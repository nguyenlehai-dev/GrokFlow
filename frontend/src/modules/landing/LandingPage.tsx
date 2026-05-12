import { Link } from "react-router-dom";
import { Check, Image as ImageIcon, Video, Zap, Shield, Code2 } from "lucide-react";
import { useDomainStore } from "@/core/domain/store";

type Tier = {
  code: string;
  name: string;
  priceVnd: number | null;       // null = "Liên hệ"
  priceLabel?: string;           // override display
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
    features: ["Tạo job ảnh", "Aspect ratio cơ bản"],
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
    description: "Cho cá nhân và freelancer — ảnh + video cơ bản",
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
      "Public API v1 cho khách",
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
    description: "Cho doanh nghiệp — không giới hạn, hỗ trợ ưu tiên",
    features: [
      "Tất cả tính năng Pro",
      "Spicy mode 18+",
      "SLA + Hỗ trợ 24/7",
      "Custom plan",
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

export function LandingPage() {
  const brandName = useDomainStore((s) => s.config?.brand_name) ?? "GrokFlow";
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-brand-600">{brandName}</Link>
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost text-sm">Đăng nhập</Link>
            <Link to="/register" className="btn-primary text-sm">Đăng ký</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 py-16 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight">
          API tạo ảnh + video bằng AI <span className="text-brand-600">cho mọi nhà</span>
        </h1>
        <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
          Tích hợp Grok AI image/video vào ứng dụng của bạn qua REST API. Không cần
          tự quản lý browser, không cần solve captcha, không cần lo về cookie expiry.
        </p>
        <div className="mt-8 flex gap-3 justify-center flex-wrap">
          <Link to="/register" className="btn-primary px-6 py-3 text-base">
            Bắt đầu miễn phí
          </Link>
          <a href="#pricing" className="btn-ghost px-6 py-3 text-base">
            Xem bảng giá
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<ImageIcon className="text-emerald-600" />}
            title="Ảnh chất lượng cao"
            desc="Aurora, Grok-2/3 Image. Full aspect ratio 1:1 / 16:9 / 9:16 / 4:3 / 3:4."
          />
          <FeatureCard
            icon={<Video className="text-blue-600" />}
            title="Video 720p"
            desc="Text-to-video + Image-to-video. Duration 3/6/9/15s. Fun + Custom mode."
          />
          <FeatureCard
            icon={<Zap className="text-amber-600" />}
            title="API REST đơn giản"
            desc="Một POST request → polling status → tải file. Webhook callback khi xong."
          />
          <FeatureCard
            icon={<Shield className="text-rose-600" />}
            title="Quota an toàn"
            desc="Rate limit per-minute + daily cap. Không lo bị phá tài khoản."
          />
          <FeatureCard
            icon={<Code2 className="text-purple-600" />}
            title="SDK & Docs đầy đủ"
            desc="curl, JavaScript, Python examples. OpenAPI/Swagger sẵn."
          />
          <FeatureCard
            icon={<Check className="text-teal-600" />}
            title="Trả tiền linh hoạt"
            desc="MoMo, VNPay, ZaloPay, Stripe. Hủy bất cứ lúc nào."
          />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900">Bảng giá đơn giản</h2>
          <p className="mt-2 text-slate-600">Chọn gói phù hợp. Nâng cấp/hạ cấp bất kỳ lúc nào.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((t) => (
            <PricingCard key={t.code} tier={t} />
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          Giá đã bao gồm VAT. Thanh toán mỗi tháng. Hủy bất cứ lúc nào.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-slate-500">
          <p>© {new Date().getFullYear()} {brandName}. All rights reserved.</p>
          <div className="mt-2 flex gap-4 justify-center">
            <Link to="/terms" className="hover:text-slate-700">Điều khoản</Link>
            <Link to="/privacy" className="hover:text-slate-700">Bảo mật</Link>
            <Link to="/login" className="hover:text-slate-700">Đăng nhập</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="card">
      <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 mt-1">{desc}</p>
    </div>
  );
}

function PricingCard({ tier }: { tier: Tier }) {
  const priceDisplay =
    tier.priceLabel ??
    (tier.priceVnd === 0
      ? "Miễn phí"
      : tier.priceVnd
      ? `${formatVnd(tier.priceVnd)}`
      : "Liên hệ");

  return (
    <div
      className={`rounded-xl border bg-white p-5 flex flex-col ${
        tier.highlight ? "border-brand-500 ring-2 ring-brand-100 shadow-md" : "border-slate-200"
      }`}
    >
      {tier.highlight && (
        <span className="self-start mb-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-brand-100 text-brand-700">
          PHỔ BIẾN
        </span>
      )}
      <h3 className="text-xl font-bold text-slate-900">{tier.name}</h3>
      <p className="text-sm text-slate-500 mt-1 min-h-[2.5rem]">{tier.description}</p>

      <div className="mt-4">
        <span className="text-3xl font-bold text-slate-900">{priceDisplay}</span>
        {tier.priceVnd && tier.priceVnd > 0 && (
          <span className="text-sm text-slate-500"> / tháng</span>
        )}
      </div>

      <ul className="mt-4 space-y-1.5 text-sm">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-slate-700">
            <Check size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 pt-4 border-t border-slate-100 space-y-1 text-xs">
        {tier.limits.map((l) => (
          <div key={l.label} className="flex justify-between text-slate-600">
            <span>{l.label}</span>
            <span className="font-mono font-semibold text-slate-900">{l.value}</span>
          </div>
        ))}
      </div>

      <Link
        to={tier.ctaTo}
        className={`mt-5 block text-center px-4 py-2 rounded-md font-medium transition ${
          tier.highlight
            ? "bg-brand-600 text-white hover:bg-brand-700"
            : "bg-slate-100 text-slate-900 hover:bg-slate-200"
        }`}
      >
        {tier.cta}
      </Link>
    </div>
  );
}
