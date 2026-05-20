// ─── Top nav ───────────────────────────────────────────────────────────────
import { Link } from "react-router-dom";
import { Wand2, ArrowRight } from "lucide-react";

export function TryImageTopNav({ brandName, isAuth, email }: { brandName: string; isAuth: boolean; email?: string | null }) {
  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-lg border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link to="/landing" className="text-xl font-bold inline-flex items-center gap-1.5">
          <Wand2 size={22} className="text-violet-600" />
          <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
            {brandName}
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-sm text-slate-600">
          <Link to="/landing#modules" className="hover:text-violet-600">Tính năng</Link>
          <Link to="/pricing" className="hover:text-violet-600">Bảng giá</Link>
          <Link to="/landing#faq" className="hover:text-violet-600">FAQ</Link>
        </nav>
        <div className="flex items-center gap-2">
          {isAuth ? (
            <>
              <span className="text-xs text-slate-500 hidden sm:inline">{email}</span>
              <Link to="/dashboard" className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-4 py-2 text-sm font-semibold">
                Dashboard <ArrowRight size={14} />
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-slate-600 hover:text-slate-800 px-2.5 py-1.5 hidden sm:inline">
                Đăng nhập
              </Link>
              <Link to="/register" className="inline-flex items-center gap-1 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-4 py-2 text-sm font-semibold hover:from-violet-700 hover:to-fuchsia-700 shadow-sm">
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
