// ─── Footer ────────────────────────────────────────────────────────────────
import { Link } from "react-router-dom";
import { Wand2 } from "lucide-react";

export function TryImageFooter({ brandName }: { brandName: string }) {
  return (
    <footer className="bg-slate-900 text-slate-300 mt-16">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid sm:grid-cols-3 gap-6 text-sm">
          <div>
            <Link to="/landing" className="font-bold text-lg inline-flex items-center gap-1.5">
              <Wand2 size={18} className="text-violet-400" />
              <span className="text-white">{brandName}</span>
            </Link>
            <p className="text-xs text-slate-9000 mt-2">
              AI image/video API + LLM Gateway + Flow tools. Self-hosted ready.
            </p>
          </div>
          <div>
            <p className="font-semibold text-white mb-1.5">Sản phẩm</p>
            <ul className="space-y-1 text-slate-9000">
              <li><Link to="/try/image" className="hover:text-violet-400">Thử Grok Image</Link></li>
              <li><Link to="/pricing" className="hover:text-violet-400">Bảng giá</Link></li>
              <li><Link to="/landing#modules" className="hover:text-violet-400">Tính năng</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white mb-1.5">Tài khoản</p>
            <ul className="space-y-1 text-slate-9000">
              <li><Link to="/login" className="hover:text-violet-400">Đăng nhập</Link></li>
              <li><Link to="/register" className="hover:text-violet-400">Đăng ký</Link></li>
              <li><Link to="/terms" className="hover:text-violet-400">Điều khoản</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
          <span>© {new Date().getFullYear()} {brandName}.</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            All systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}
