import type { UseFormRegister } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Mail, Lock } from "lucide-react";
import type { LoginFormValues } from "../models/auth";

interface Props {
  brandName: string;
  error: string | null;
  isSubmitting: boolean;
  register: UseFormRegister<LoginFormValues>;
  onSubmit: (e: React.FormEvent) => void;
}

/** "admin" login layout — minimal centered console card on dark backdrop.
 *  No marketing copy, no register link, no public surface. Used by
 *  /admin/login and any domain whose `login_template === "admin"`. */
export function LoginLayoutAdmin({ brandName, error, isSubmitting, register, onSubmit }: Props) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md rounded-xl bg-slate-800/80 border border-slate-700 shadow-2xl p-8 space-y-6 backdrop-blur">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-700">
            <ShieldCheck size={22} className="text-emerald-400" />
          </div>
          <h1 className="text-2xl font-semibold text-white">{brandName}</h1>
          <p className="text-xs uppercase tracking-widest text-slate-400">
            {t("auth.admin_console_label", "Admin Console")}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              {t("auth.login_email")}
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                autoComplete="username"
                placeholder="admin@example.com"
                className="w-full rounded-md bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 py-2.5 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register("email", { required: true })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              {t("auth.login_password")}
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-md bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 py-2.5 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                {...register("password", { required: true })}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-200 px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold py-2.5 transition disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? t("auth.login_submitting") : t("auth.login_submit")}
          </button>
        </form>

        <p className="text-[11px] text-center text-slate-500">
          {t("auth.admin_console_footer", "Restricted area — staff access only.")}
        </p>
      </div>
    </div>
  );
}
