import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";

interface PublicPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_default: boolean;
  price_vnd: number | null;
  price_usd_cents: number | null;
  entitlements: {
    features?: Record<string, boolean>;
    limits?: Record<string, number>;
  };
}

const formatVnd = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(n) + "₫";

// Marketing taglines per plan code
const TAGLINES: Record<string, string[]> = {
  free: ["Tạo job ảnh", "Aspect ratio cơ bản"],
  basic: ["Tạo ảnh + video", "Image-to-image", "Fun mode", "Full aspect ratios"],
  pro: [
    "Tất cả tính năng Basic",
    "Image quality cao",
    "Video 720p + 10s + Custom mode",
    "Image-to-video",
    "Public API v1 cho khách",
    "Webhooks + Audit log",
  ],
  enterprise: [
    "Tất cả tính năng Pro",
    "Spicy mode 18+",
    "SLA + Hỗ trợ 24/7",
    "Custom plan",
  ],
};

export function PricingPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");

  const { data: plans, isLoading } = useQuery({
    queryKey: ["plans-public"],
    queryFn: async () => (await api.get<PublicPlan[]>("/api/plans/public")).data,
  });

  const currentPlanCode = me?.entitlements?.plan_code;

  if (isLoading) return <p className="text-ink-400">Đang tải...</p>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Đổi gói</h1>
          <p className="text-sm text-ink-400 mt-1">
            Chọn gói phù hợp. Nâng cấp/hạ cấp bất cứ lúc nào — không phí ẩn.
          </p>
        </div>
        {/* Billing cycle toggle */}
        <div className="inline-flex rounded-md border border-ink-800 bg-ink-900 p-0.5">
          <CycleBtn active={cycle === "monthly"} onClick={() => setCycle("monthly")}>Hàng tháng</CycleBtn>
          <CycleBtn active={cycle === "yearly"} onClick={() => setCycle("yearly")}>
            Hàng năm <span className="ml-1 text-xs text-emerald-600 font-bold">-17%</span>
          </CycleBtn>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(plans ?? []).map((p) => {
          const isCurrent = p.code === currentPlanCode;
          const isHighlight = p.code === "pro";
          const taglines = TAGLINES[p.code] ?? [];
          const priceDisplay =
            p.price_vnd === null
              ? "Liên hệ"
              : p.price_vnd === 0
              ? "Miễn phí"
              : cycle === "yearly"
              ? formatVnd(p.price_vnd * 10)  // 2 months free
              : formatVnd(p.price_vnd);

          return (
            <div
              key={p.id}
              className={`rounded-xl border bg-ink-900 p-5 flex flex-col ${
                isHighlight ? "border-brand-500 ring-2 ring-brand-100 shadow-md" : "border-ink-800"
              } ${isCurrent ? "ring-2 ring-emerald-300" : ""}`}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-white">{p.name}</h3>
                {isCurrent && (
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">
                    Hiện tại
                  </span>
                )}
                {isHighlight && !isCurrent && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-100 text-brand-700">
                    Phổ biến
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-400 mt-1 min-h-[2.5rem]">{p.description}</p>

              <div className="mt-4">
                <span className="text-3xl font-bold text-white">{priceDisplay}</span>
                {p.price_vnd && p.price_vnd > 0 && (
                  <span className="text-sm text-ink-400"> / {cycle === "yearly" ? "năm" : "tháng"}</span>
                )}
              </div>

              <ul className="mt-4 space-y-1.5 text-sm flex-1">
                {taglines.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-ink-200">
                    <Check size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>

              <PlanCTA
                plan={p}
                isCurrent={isCurrent}
                onCheckout={() => navigate(`/checkout/${p.code}?cycle=${cycle}`)}
              />
            </div>
          );
        })}
      </div>

      <p className="text-center text-sm text-ink-400">
        Đã có thắc mắc? <Link to="/billing" className="text-brand-600 hover:underline">Quay lại trang Billing</Link>
      </p>
    </div>
  );
}

function CycleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded transition ${
        active ? "bg-brand-600 text-white" : "text-ink-200 hover:bg-ink-950"
      }`}
    >
      {children}
    </button>
  );
}

function PlanCTA({
  plan, isCurrent, onCheckout,
}: { plan: PublicPlan; isCurrent: boolean; onCheckout: () => void }) {
  if (isCurrent) {
    return (
      <button
        disabled
        className="mt-5 block w-full text-center px-4 py-2 rounded-md font-medium bg-ink-800 text-ink-400 cursor-default"
      >
        Gói hiện tại
      </button>
    );
  }
  if (plan.price_vnd === null) {
    return (
      <a
        href="mailto:sales@grokflow.io"
        className="mt-5 block text-center px-4 py-2 rounded-md font-medium bg-ink-800 text-white hover:bg-slate-200"
      >
        Liên hệ Sales
      </a>
    );
  }
  if (plan.price_vnd === 0) {
    return (
      <button
        disabled
        className="mt-5 block w-full text-center px-4 py-2 rounded-md font-medium bg-ink-800 text-ink-400 cursor-default"
      >
        Plan mặc định
      </button>
    );
  }
  return (
    <button
      onClick={onCheckout}
      className="mt-5 block w-full text-center px-4 py-2 rounded-md font-medium bg-brand-600 text-white hover:bg-brand-700"
    >
      Chọn gói {plan.name}
    </button>
  );
}
