// ─── Below-fold sections ──────────────────────────────────────────────────
import { Sparkles, ImageIcon, Zap, Download } from "lucide-react";

export function TryImageHowItWorksStrip() {
  const steps = [
    { icon: Sparkles, title: "Gõ prompt", desc: "Mô tả ảnh bằng tiếng Việt hoặc tiếng Anh" },
    { icon: ImageIcon, title: "Chọn khung hình", desc: "Vuông, ngang 16:9, dọc 9:16 hoặc 4:3 / 3:4" },
    { icon: Zap, title: "Bấm tạo", desc: "Render ~15s với chế độ Nhanh, ~45s với Cao" },
    { icon: Download, title: "Tải về", desc: "PNG/JPG full resolution. Dùng commercial OK" },
  ];
  return (
    <section className="mt-16">
      <div className="text-center mb-8">
        <p className="text-xs uppercase tracking-wider text-violet-600 font-bold">Cách dùng · 4 bước</p>
        <h2 className="mt-1 text-2xl sm:text-3xl font-bold">Từ prompt đến ảnh trong 1 phút</h2>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((s, i) => (
          <div key={s.title} className="relative rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <span className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white font-bold text-sm flex items-center justify-center shadow-md">
              {i + 1}
            </span>
            <s.icon size={22} className="text-violet-600" />
            <h3 className="font-bold mt-3">{s.title}</h3>
            <p className="text-sm text-slate-600 mt-1 leading-snug">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
