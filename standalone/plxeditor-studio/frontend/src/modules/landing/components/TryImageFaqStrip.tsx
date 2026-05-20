import { useState } from "react";
import { ArrowRight, X } from "lucide-react";

export function TryImageFaqStrip() {
  const items = [
    {
      q: "Ảnh tạo ra mình có dùng thương mại được không?",
      a: "Có — bạn giữ bản quyền các ảnh do prompt của bạn tạo ra. Tuy nhiên không nên dùng cho nội dung deceptive, deepfake, hoặc vi phạm bản quyền của người khác.",
    },
    {
      q: "Tại sao bị giới hạn chỉ 2 ảnh?",
      a: "Anonymous được dùng thử để cảm nhận chất lượng. Để dùng nhiều hơn, đăng ký Free (10 ảnh/ngày) hoặc Basic 199k/tháng (50/ngày).",
    },
    {
      q: "Quality mode khác Speed mode thế nào?",
      a: "Speed render trong ~15s, kết quả OK cho social media. Quality render ~45s, chi tiết hơn, phù hợp poster, in ấn. Quality chỉ available trên gói Pro.",
    },
    {
      q: "Có lưu lịch sử ảnh không?",
      a: "Lịch sử 6 ảnh gần nhất được lưu trong trình duyệt (localStorage). Đăng ký tài khoản để lưu vĩnh viễn ở /gallery.",
    },
  ];
  return (
    <section className="mt-16 max-w-3xl mx-auto">
      <div className="text-center mb-6">
        <p className="text-xs uppercase tracking-wider text-violet-600 font-bold">FAQ</p>
        <h2 className="mt-1 text-2xl font-bold">Câu hỏi thường gặp</h2>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => <FaqRow key={i} q={it.q} a={it.a} />)}
      </div>
    </section>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
      >
        <span className="font-semibold text-sm text-slate-800">{q}</span>
        {open ? <X size={14} className="text-violet-600 rotate-45" /> : <ArrowRight size={14} className="text-slate-9000" />}
      </button>
      {open && (
        <div className="px-4 pb-3 text-sm text-slate-600 leading-relaxed border-t border-slate-200 pt-2">
          {a}
        </div>
      )}
    </div>
  );
}
