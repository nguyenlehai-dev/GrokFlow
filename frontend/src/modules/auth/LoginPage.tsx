import { useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { Sparkles, Mail, Lock, ArrowRight, Image as ImageIcon, Video, Zap } from "lucide-react";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";

interface FormValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const { token, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormValues>();
  const brandName = useDomainStore((s) => s.config?.brand_name) ?? "GrokFlow";
  const firstAllowedPath = useDomainStore((s) => s.firstAllowedPath);

  if (token) return <Navigate to={firstAllowedPath()} replace />;

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const { data } = await api.post("/api/auth/login", values);
      const me = await api.get("/api/auth/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      setAuth(data.access_token, me.data);
      const target = (me.data?.role === "admin" || me.data?.role === "super_admin") ? "/dashboard" : firstAllowedPath();
      navigate(target);
    } catch (e: any) {
      setError(e?.response?.data?.detail?.message ?? "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-mesh">
      {/* Left art panel — hidden on mobile, shows brand identity + feature
          highlights so the page is more than a bare form. */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-brand">
        {/* Decorative orbs */}
        <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-ink-900/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-accent-fuchsia/30 blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-accent-cyan/20 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <Link to="/" className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-ink-900/15 backdrop-blur flex items-center justify-center font-bold text-xl">
              {brandName[0]}
            </span>
            <span className="font-bold text-2xl">{brandName}</span>
          </Link>

          <div className="space-y-8">
            <div>
              <h2 className="text-4xl font-bold leading-tight">
                Một nền tảng,<br />mọi công cụ AI.
              </h2>
              <p className="mt-4 text-white/80 text-lg max-w-md">
                Image · Video · Flow Tools · LLM Gateway — đăng nhập một lần dùng được hết.
              </p>
            </div>

            <ul className="space-y-3">
              {[
                { icon: ImageIcon, text: "Grok Imagine: Aurora, Grok-2, Grok-3" },
                { icon: Video, text: "Video gen 480p/720p, tới 15s" },
                { icon: Zap, text: "API key duy nhất, route tự động" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-white/90">
                  <span className="w-8 h-8 rounded-lg bg-ink-900/15 flex items-center justify-center">
                    <Icon size={16} />
                  </span>
                  <span className="text-sm">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/60">
            © {new Date().getFullYear()} {brandName}. All rights reserved.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-6 animate-fade-in">
          {/* Mobile brand header — visible only when art panel is hidden */}
          <div className="lg:hidden text-center space-y-2">
            <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-brand text-white items-center justify-center font-bold text-xl shadow-brand">
              {brandName[0]}
            </div>
            <h1 className="font-bold text-xl text-ink-900">{brandName}</h1>
          </div>

          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-ink-900">
              Chào mừng <span className="text-gradient">trở lại</span>
            </h1>
            <p className="text-sm text-ink-500">Đăng nhập để tiếp tục với {brandName}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-700 uppercase tracking-wider">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="you@example.com"
                  className="input pl-10"
                  {...register("email", { required: true })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-700 uppercase tracking-wider">Mật khẩu</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="input pl-10"
                  {...register("password", { required: true })}
                />
              </div>
            </div>

            {error && (
              <div className="alert-danger animate-slide-up">
                <span className="text-sm">{error}</span>
              </div>
            )}

            <button type="submit" className="btn-primary w-full btn-lg" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Sparkles size={18} className="animate-pulse" />
                  Đang đăng nhập...
                </>
              ) : (
                <>
                  Đăng nhập
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <p className="text-sm text-center text-ink-500">
            Chưa có tài khoản?{" "}
            <Link to="/register" className="font-semibold text-gradient hover:underline">
              Đăng ký miễn phí
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
