import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { KeyRound } from "lucide-react";
import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";
import { settingsService } from "../services/settings.service";

export function SettingsAccountTab() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  return (
    <>
      <section className="card space-y-2">
        <h2 className="font-semibold text-slate-800">{t("settings.account_title")}</h2>
        <p className="text-sm text-slate-600">
          {t("settings.account_email")}: <span className="font-medium">{user?.email}</span>
        </p>
        <p className="text-sm text-slate-600">
          {t("settings.account_role")}: <span className="font-medium">{user?.role}</span>
        </p>
      </section>
      <PasswordSection />
    </>
  );
}

function PasswordSection() {
  const { t } = useTranslation();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<{ current_password: string; new_password: string }>();
  const onSubmit = async (v: { current_password: string; new_password: string }) => {
    await settingsService.changePassword(v);
    toast(t("settings.account_password_saved"), "success");
    reset();
  };
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold flex items-center gap-2 text-slate-800">
        <KeyRound size={16} /> {t("settings.account_change_password")}
      </h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
        <div>
          <label className="text-sm font-medium text-slate-700">
            {t("settings.account_current_password")}
          </label>
          <input type="password" className="input" {...register("current_password", { required: true })} />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">
            {t("settings.account_new_password")}
          </label>
          <input type="password" className="input" {...register("new_password", { required: true, minLength: 8 })} />
        </div>
        <button className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("settings.account_change_password")}
        </button>
      </form>
    </section>
  );
}
