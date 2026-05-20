// ─── Top nav ───────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function TopNav({ brandName }: { brandName: string }) {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav
      className={`sticky top-0 z-30 transition-all ${
        scrolled
          ? "bg-black/85 backdrop-blur-md border-b border-slate-200"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 group">
          <span
            className="w-9 h-9 rounded-xl text-white flex items-center justify-center font-display font-bold shadow-brand"
            style={{ background: "linear-gradient(135deg, #ff8a4c 0%, #c147e9 100%)" }}
          >
            {brandName[0].toUpperCase()}
          </span>
          <span className="font-display font-bold text-lg text-white tracking-tight">
            {brandName}
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-7 text-sm font-semibold text-white/80">
          <a href="#modules" className="hover:text-slate-800 transition">{t("landing.nav_products", "Sản phẩm")}</a>
          <a href="#pricing" className="hover:text-slate-800 transition">{t("landing.nav_pricing", "Gói cước")}</a>
          <a href="#faq" className="hover:text-slate-800 transition">{t("landing.nav_faq", "FAQ")}</a>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/login" className="text-sm font-semibold text-white/80 hover:text-slate-800 px-3 py-1.5">{t("landing.nav_login", "Đăng nhập")}</Link>
          <Link to="/register" className="btn-primary btn-sm">{t("landing.nav_register", "Dùng thử")}</Link>
        </div>
      </div>
    </nav>
  );
}
