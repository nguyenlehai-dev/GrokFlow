import { useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  Sparkles, Mail, Lock, ArrowRight,
  Image as ImageIcon, Video, Zap,
} from "lucide-react";
import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";

import type { LoginFormValues } from "../models/auth";
import { authService } from "../services/auth.service";
import { AuthArtPanel } from "../components/AuthArtPanel";
import { AuthBrandHeader } from "../components/AuthBrandHeader";

export function LoginPage() {
  const { t } = useTranslation();
  const { token, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<LoginFormValues>();
  const brandName = useDomainStore((s) => s.config?.brand_name) ?? "Nexoratech";
  const firstAllowedPath = useDomainStore((s) => s.firstAllowedPath);

  if (token) return <Navigate to={firstAllowedPath()} replace />;

  const onSubmit = async (values: LoginFormValues) => {
    setError(null);
    try {
      const data = await authService.login(values);
      const me = await authService.meWithToken(data.access_token);
      setAuth(data.access_token, me);
      const target = (me?.role === "admin" || me?.role === "super_admin") ? "/dashboard" : firstAllowedPath();
      navigate(target);
    } catch (e: any) {
      setError(e?.response?.data?.detail?.message ?? "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left art panel — hidden on mobile, shows brand identity + feature
          highlights so the page is more than a bare form. Uses the same
          sky→blue→indigo gradient as the landing's hero overlay so the
          public + auth surfaces visually belong to one product. */}
      <AuthArtPanel
        brandName={brandName}
        gradientClass="bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700"
        headline={<>Một nền tảng,<br />mọi công cụ AI.</>}
        subtitle="Image · Video · Flow Tools · LLM Gateway — đăng nhập một lần dùng được hết."
        bullets={[
          { icon: ImageIcon, text: "Grok Imagine: Aurora, Grok-2, Grok-3" },
          { icon: Video, text: "Video gen 480p/720p, tới 15s" },
          { icon: Zap, text: "API key duy nhất, route tự động" },
        ]}
        blobs={
          <>
            <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-white/15 blur-3xl" />
            <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-sky-300/35 blur-3xl" />
            <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full bg-indigo-300/25 blur-3xl" />
          </>
        }
        copyrightSuffix="All rights reserved."
      />

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-6 animate-fade-in">
          {/* Mobile brand header — visible only when art panel is hidden */}
          <AuthBrandHeader brandName={brandName} />

          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {t("auth.login_welcome")}{" "}
              <span className="bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">
                {t("auth.login_welcome_2")}
              </span>
            </h1>
            <p className="text-sm text-slate-500">{t("auth.login_subtitle")} {brandName}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("auth.login_email")}
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
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
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("auth.login_password")}
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
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
                  {t("auth.login_submitting")}
                </>
              ) : (
                <>
                  {t("auth.login_submit")}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <p className="text-sm text-center text-slate-500">
            {t("auth.login_no_account")}{" "}
            <Link
              to="/register"
              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              {t("auth.login_register_link")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
