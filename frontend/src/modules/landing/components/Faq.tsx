// ─── FAQ ───────────────────────────────────────────────────────────────
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Minus } from "lucide-react";

import { SectionHeader } from "./SectionHeader";

export function Faq() {
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
              {open === i ? <Minus size={16} className="shrink-0 text-accent-spotify" /> : <Plus size={16} className="shrink-0 text-slate-500" />}
            </button>
            {open === i && (
              <p className="mt-3 text-sm text-slate-600 leading-relaxed animate-slide-up">{it.a}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
