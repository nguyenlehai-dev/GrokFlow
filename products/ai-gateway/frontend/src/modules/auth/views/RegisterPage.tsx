import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { Mail, Lock, User, ArrowRight, Sparkles } from "lucide-react";
import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";

import type { RegisterFormValues } from "../models/auth";
import { authService } from "../services/auth.service";
import { AuthArtPanel } from "../components/AuthArtPanel";
import { AuthBrandHeader } from "../components/AuthBrandHeader";

export function RegisterPage() {
  const { t } = useTranslation();
  const { token, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register, handleSubmit, watch,
    formState: { isSubmitting, errors },
  } = useForm<RegisterFormValues>();
  const brandName = useDomainStore((s) => s.config?.brand_name) ?? "Nexoratech";
  const firstAllowedPath = useDomainStore((s) => s.firstAllowedPath);

  if (token) return <Navigate to={firstAllowedPath()} replace />;

  const passwordValue = watch("password");

  const onSubmit = async (values: RegisterFormValues) => {
    setError(null);
    if (values.password !== values.password_confirm) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }
    try {
      const data = await authService.register({
        email: values.email,
        password: values.password,
        full_name: values.full_name || null,
      });
      const me = await authService.meWithToken(data.access_token);
      setAuth(data.access_token, me);
      const target = (me?.role === "admin" || me?.role === "super_admin") ? "/dashboard" : firstAllowedPath();
      navigate(target);
    } catch (e: any) {
      setError(e?.response?.data?.detail?.message ?? "Đăng ký thất bại");
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left art panel — mirrors LoginPage but pitches the free trial. */}
      <AuthArtPanel
        brandName={brandName}
        eyebrow="Free forever — không cần thẻ"
        headline={
          <>
            Bắt đầu trong<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-100 to-white">
              30 giây.
            </span>
          </>
        }
        subtitle="Tài khoản miễn phí đã có 50 image/tháng. Cần thêm thì lên Pro bất kỳ lúc nào."
        bullets={[
          { text: "50 image/tháng — Aurora model" },
          { text: "Public API key, swap providers tự động" },
          { text: "Không lock-in, hủy bất kỳ lúc nào" },
          { text: "Hỗ trợ tiếng Việt, server VN" },
        ]}
        blobs={
          <>
            <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-sky-300/30 blur-3xl" />
            <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-indigo-300/20 blur-3xl" />
          </>
        }
      />

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        <div className="w-full max-w-sm space-y-5 animate-fade-in py-8">
          <AuthBrandHeader brandName={brandName} />

          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {t("auth.register_title")}{" "}
              <span className="bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">
                {t("auth.register_title_2")}
              </span>
            </h1>
            <p className="text-sm text-slate-500">{t("auth.register_subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("auth.register_full_name")}{" "}
                <span className="text-slate-500 normal-case font-normal">
                  {t("auth.register_full_name_optional")}
                </span>
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Nguyễn Văn A"
                  className="input pl-10"
                  {...register("full_name", { maxLength: 255 })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("auth.login_email")}
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="input pl-10"
                  {...register("email", { required: t("auth.register_email_required") })}
                />
              </div>
              {errors.email && <p className="text-xs text-rose-600">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("auth.login_password")}
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("auth.register_password_placeholder")}
                  className="input pl-10"
                  {...register("password", {
                    required: t("auth.register_password_required"),
                    minLength: { value: 8, message: t("auth.register_password_min") },
                    maxLength: { value: 128, message: t("auth.register_password_max") },
                  })}
                />
              </div>
              {errors.password && <p className="text-xs text-rose-600">{errors.password.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {t("auth.account_confirm_password")}
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("auth.register_confirm_placeholder")}
                  className="input pl-10"
                  {...register("password_confirm", {
                    required: t("auth.register_confirm_required"),
                    validate: (v) => v === passwordValue || t("auth.register_confirm_mismatch"),
                  })}
                />
              </div>
              {errors.password_confirm && (
                <p className="text-xs text-rose-600">{errors.password_confirm.message}</p>
              )}
            </div>

            {error && (
              <div className="alert-danger animate-slide-up">
                <span className="text-sm">{error}</span>
              </div>
            )}

            <button className="btn-primary w-full btn-lg" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Sparkles size={18} className="animate-pulse" />
                  {t("auth.register_submitting")}
                </>
              ) : (
                <>
                  {t("auth.register_submit")}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-center">
            {t("auth.register_terms")}{" "}
            <a href="/terms" className="font-medium text-slate-700 hover:text-blue-700">
              {t("auth.register_terms_link")}
            </a>{" "}&amp;{" "}
            <a href="/privacy" className="font-medium text-slate-700 hover:text-blue-700">
              {t("auth.register_privacy_link")}
            </a>.
          </p>

          <p className="text-sm text-center text-slate-500">
            {t("auth.register_have_account")}{" "}
            <Link to="/login" className="font-semibold bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent hover:underline">
              {t("auth.register_login_link")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
