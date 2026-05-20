import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";
import type { DomainOpt, RoleOpt } from "../models/user";
import type { Plan } from "../models/plan";
import { usersService } from "../services/users.service";
import { domainsService } from "../services/domains.service";
import { rolesService } from "../services/roles.service";

// --- Create user modal -----------------------------------------------------

export interface CreateValues {
  email: string;
  password: string;
  full_name: string;
  role: "super_admin" | "admin" | "user" | "support";
  plan_id: string;
  domain_id: string;
  role_id: string;
}

export function CreateUserModal({ plans, onClose }: { plans: Plan[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";
  const defaultPlan = plans.find((p) => p.is_default);
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm<CreateValues>({
    defaultValues: { role: "user", plan_id: defaultPlan?.id ?? "", domain_id: "", role_id: "" },
  });
  // Domain picker — super_admin only (backend forces the admin's domain otherwise).
  const { data: domains } = useQuery<DomainOpt[]>({
    queryKey: ["admin-domains"],
    queryFn: () => domainsService.listAs<DomainOpt>(),
    enabled: isSuper,
  });
  // Roles list — for super_admin filtered by the picked domain; for domain
  // admin all roles in their own domain (backend scopes /api/admin/roles).
  const watchedDomainId = watch("domain_id");
  const targetDomainId = isSuper ? watchedDomainId : (me?.domain_id ?? "");
  const { data: roles } = useQuery<RoleOpt[]>({
    queryKey: ["admin-roles-for-create", targetDomainId],
    queryFn: () =>
      rolesService.list(isSuper ? targetDomainId : undefined) as Promise<RoleOpt[]>,
    enabled: !isSuper || !!targetDomainId,
  });
  const onSubmit = async (v: CreateValues) => {
    const payload: any = { ...v };
    if (!payload.plan_id) delete payload.plan_id;
    if (!payload.domain_id || !isSuper) delete payload.domain_id;
    if (!payload.role_id) delete payload.role_id;
    try {
      await usersService.create(payload);
    } catch (e: any) {
      const msg = e?.response?.data?.detail?.message ?? t("admin.create_user_error");
      toast(msg, "error");
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    toast(t("admin.create_user_ok"), "success");
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">{t("admin.create_user_title")}</h2>
        <div>
          <label className="text-sm font-medium">{t("admin.create_user_email")}</label>
          <input className="input" type="email" {...register("email", { required: true })} />
        </div>
        <div>
          <label className="text-sm font-medium">{t("admin.create_user_password")}</label>
          <input className="input" type="password" {...register("password", { required: true, minLength: 8 })} />
        </div>
        <div>
          <label className="text-sm font-medium">{t("admin.create_user_full_name_label")}</label>
          <input className="input" {...register("full_name")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">{t("admin.create_user_role")}</label>
            <select className="input" {...register("role")}>
              <option value="user">{t("admin.create_user_role_user")}</option>
              <option value="admin">{t("admin.create_user_role_admin")}</option>
              {isSuper && <option value="super_admin">{t("admin.create_user_role_super")}</option>}
              <option value="support">{t("admin.create_user_role_support")}</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">{t("admin.create_user_plan")}</label>
            <select className="input" {...register("plan_id")}>
              <option value="">{t("admin.create_user_plan_default")}</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        {isSuper && (
          <div>
            <label className="text-sm font-medium">{t("admin.create_user_domain")}</label>
            <select className="input" {...register("domain_id")}>
              <option value="">{t("admin.create_user_domain_global")}</option>
              {(domains ?? []).filter((d) => d.hostname !== "*").map((d) => (
                <option key={d.id} value={d.id}>{d.hostname} — {d.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">{t("admin.create_user_domain_hint")}</p>
          </div>
        )}
        <div>
          <label className="text-sm font-medium">{t("admin.create_user_role_perdomain")}</label>
          <select className="input" {...register("role_id")}>
            <option value="">{t("admin.create_user_role_inherit")}</option>
            {(roles ?? []).filter((r) => r.status === "active").map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">{t("admin.create_user_role_hint")}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">{t("common.cancel")}</button>
          <button className="btn-primary" disabled={isSubmitting}>{t("admin.create_user_submit")}</button>
        </div>
      </form>
    </div>
  );
}
