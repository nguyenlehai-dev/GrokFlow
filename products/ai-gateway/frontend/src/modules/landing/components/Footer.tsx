// ─── Footer ────────────────────────────────────────────────────────────
import { Link } from "react-router-dom";
import { Globe } from "lucide-react";

export function Footer({ brandName }: { brandName: string }) {
  return (
    <footer className="border-t border-slate-200 mt-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid md:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-lg bg-gradient-album text-white flex items-center justify-center font-bold text-xs">
              {brandName[0]}
            </span>
            <span className="font-bold text-white">{brandName}</span>
          </div>
          <p className="text-slate-500 text-xs leading-relaxed">
            Multi-tenant AI studio. Image, Video, Flow, Gateway. Một nền tảng.
          </p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 mb-3">Sản phẩm</p>
          <ul className="space-y-2 text-slate-500">
            <li><Link to="/try/image" className="hover:text-slate-800">Try Image</Link></li>
            <li><a href="#modules" className="hover:text-slate-800">Modules</a></li>
            <li><a href="#pricing" className="hover:text-slate-800">Pricing</a></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-slate-700 mb-3">Tài nguyên</p>
          <ul className="space-y-2 text-slate-500">
            <li><a href="#faq" className="hover:text-slate-800">FAQ</a></li>
            <li><a href="/terms" className="hover:text-slate-800">Điều khoản</a></li>
            <li><a href="/privacy" className="hover:text-slate-800">Bảo mật</a></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-slate-700 mb-3">Liên hệ</p>
          <ul className="space-y-2 text-slate-500">
            <li><a href="mailto:admin@groks.io" className="hover:text-slate-800">admin@groks.io</a></li>
            <li className="inline-flex items-center gap-1">
              <Globe size={12} /> Server tại VN
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200 py-5 text-center text-xs text-slate-9000">
        © {new Date().getFullYear()} {brandName}. All rights reserved.
      </div>
    </footer>
  );
}
