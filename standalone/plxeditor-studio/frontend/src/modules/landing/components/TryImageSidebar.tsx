// ─── Sidebar cards ────────────────────────────────────────────────────────
import { Link } from "react-router-dom";
import {
  ArrowRight, Lightbulb, Crown, BookOpen,
} from "lucide-react";

import { PROMPT_EXAMPLES } from "../configs/try-image-data";

export function ExamplePromptsCard({ onPick }: { onPick: (p: string) => void }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 ring-1 ring-violet-200">
      <h3 className="font-semibold text-slate-800 inline-flex items-center gap-1.5 mb-2">
        <Lightbulb size={16} className="text-amber-500" /> Prompt mẫu
      </h3>
      <p className="text-xs text-slate-600 mb-3">
        Bí ý tưởng? Bấm để dùng:
      </p>
      <ul className="space-y-1.5">
        {PROMPT_EXAMPLES.map((p) => (
          <li key={p.label}>
            <button
              onClick={() => onPick(p.prompt)}
              className="w-full text-left text-sm rounded-md bg-white hover:bg-violet-100 px-3 py-2 transition flex items-center gap-2"
            >
              <span className="text-base">{p.emoji}</span>
              <span className="font-medium text-slate-700 flex-1">{p.label}</span>
              <ArrowRight size={12} className="text-slate-9000" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TipsCard() {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h3 className="font-semibold text-slate-800 inline-flex items-center gap-1.5 mb-2">
        <BookOpen size={16} className="text-cyan-600" /> Prompt hay
      </h3>
      <ul className="space-y-2 text-xs text-slate-600 leading-relaxed">
        <li><strong className="text-slate-800">Cụ thể hơn</strong> luôn tốt hơn. "Mèo" → "mèo Anh lông ngắn, mắt xanh, nằm trên ghế velvet đỏ".</li>
        <li><strong className="text-slate-800">Thêm style</strong>: watercolor, oil painting, photorealistic, anime, 3D render, pixel art.</li>
        <li><strong className="text-slate-800">Thêm lighting</strong>: golden hour, neon, dramatic side lighting, soft studio.</li>
        <li><strong className="text-slate-800">Tỷ lệ phù hợp</strong>: 16:9 cho landscape, 9:16 cho mobile, 1:1 cho avatar.</li>
        <li><strong className="text-slate-800">English thường ra tốt hơn</strong> tiếng Việt vì model train chủ yếu tiếng Anh.</li>
      </ul>
    </div>
  );
}

export function UpsellCard() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 text-white p-5 shadow-lg">
      <Crown size={20} className="text-amber-200" />
      <h3 className="font-bold mt-2">Cần dùng nhiều hơn?</h3>
      <p className="text-xs opacity-90 mt-1 leading-relaxed">
        Đăng ký miễn phí để nhận 10 ảnh/ngày. Lên Pro: 200 ảnh + 200 video, API key, Quality mode, Webhook.
      </p>
      <div className="mt-3 space-y-1.5">
        <Link to="/register" className="block text-center rounded-md bg-white text-violet-700 px-4 py-2 text-sm font-bold hover:bg-violet-50">
          Đăng ký miễn phí
        </Link>
        <Link to="/pricing" className="block text-center rounded-md bg-white/15 backdrop-blur-sm border border-white/40 text-white px-4 py-2 text-sm font-semibold hover:bg-white/25">
          Xem bảng giá
        </Link>
      </div>
    </div>
  );
}
