import { Link } from "react-router-dom";
import type { UseFormRegister, FieldValues } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  Sparkles, Mail, Lock, ArrowRight,
  Image as ImageIcon, Video, Zap,
} from "lucide-react";
import { AuthArtPanel } from "../components/AuthArtPanel";
import { AuthBrandHeader } from "../components/AuthBrandHeader";
import type { LoginFormValues } from "../models/auth";

interface Props {
  brandName: string;
  error: string | null;
  isSubmitting: boolean;
  register: UseFormRegister<LoginFormValues>;
  onSubmit: (e: React.FormEvent) => void;
}

/** "default" login layout — branded marketing-style split panel + form.
 *  Used by domains whose `login_template === "default"`. */
export function LoginLayoutDefault({ brandName, error, isSubmitting, register, onSubmit }: Props) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex bg-slate-50">
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

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-6 animate-fade-in">
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

          <form onSubmit={onSubmit} className="space-y-4">
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
