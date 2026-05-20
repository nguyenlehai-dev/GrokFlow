import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ChevronDown } from "lucide-react";
import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";
import type { AdminUser, DomainOpt, RoleOpt } from "../models/user";
import type { Plan } from "../models/plan";
import { usersService } from "../services/users.service";
import { domainsService } from "../services/domains.service";
import { rolesService } from "../services/roles.service";
import { NULL_FK_SENTINEL } from "../utils/sentinels";

// --- Per-user permissions modal --------------------------------------------

export function UserPermissionsModal({
  user, plans, onClose,
}: { user: AdminUser; plans: Plan[]; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: catalog } = useQuery({
    queryKey: ["admin-entitlement-catalog"],
    queryFn: () => usersService.entitlementCatalog(),
  });
  const { data: effective } = useQuery({
    queryKey: ["admin-user-effective", user.id],
    queryFn: () => usersService.effectiveEntitlements(user.id),
  });

  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";

  const [planId, setPlanId] = useState<string>(user.plan_id ?? "");
  const [domainId, setDomainId] = useState<string>(user.domain_id ?? "");
  const [roleId, setRoleId] = useState<string>(user.role_id ?? "");
  const [roleTier, setRoleTier] = useState<string>(user.role ?? "user");
  const [featOverride, setFeatOverride] = useState<Record<string, boolean>>(
    () => (user.entitlement_overrides as any)?.features ?? {},
  );
  const [limitOverride, setLimitOverride] = useState<Record<string, number>>(
    () => (user.entitlement_overrides as any)?.limits ?? {},
  );

  // Per-user overrides are a power-user feature — 99% of admins just
  // change the plan and move on. Hide the dense feature/limit grids
  // behind an accordion, auto-expand only when this user already HAS
  // overrides so the admin doesn't lose sight of unusual configs.
  const hasOverrides =
    Object.keys((user.entitlement_overrides as any)?.features ?? {}).length > 0 ||
    Object.keys((user.entitlement_overrides as any)?.limits ?? {}).length > 0;
  const [showAdvanced, setShowAdvanced] = useState(hasOverrides);
  const overrideCount =
    Object.keys(featOverride).length + Object.keys(limitOverride).length;

  // Domain list (super only — domain admin's choice is fixed to their own).
  const { data: domains } = useQuery<DomainOpt[]>({
    queryKey: ["admin-domains"],
    queryFn: () => domainsService.listAs<DomainOpt>(),
    enabled: isSuper,
  });
  // Roles for the user's (current/edited) domain.
  const { data: roles } = useQuery<RoleOpt[]>({
    queryKey: ["admin-roles-for-user", domainId],
    queryFn: () =>
      rolesService.list(isSuper ? domainId : undefined) as Promise<RoleOpt[]>,
    enabled: !!domainId,
  });

  // When domain changes, clear role (the role wouldn't be valid in the new
  // domain anyway — backend rejects it).
  const onDomainChange = (id: string) => {
    setDomainId(id);
    setRoleId("");
  };

  const save = useMutation({
    mutationFn: async () => {
      const overrides: any = {};
      if (Object.keys(featOverride).length) overrides.features = featOverride;
      if (Object.keys(limitOverride).length) overrides.limits = limitOverride;
      const body: any = {
        plan_id: planId || NULL_FK_SENTINEL,
        entitlement_overrides: overrides,
        // Zero-uuid sentinel clears the field (backend understands this).
        role_id: roleId || NULL_FK_SENTINEL,
        role: roleTier,
      };
      if (isSuper) {
        body.domain_id = domainId || NULL_FK_SENTINEL;
      }
      return usersService.update(user.id, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-user-effective", user.id] });
      toast(t("admin.up_saved"), "success");
      onClose();
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail?.message ?? t("admin.up_save_error"), "error");
    },
  });

  const featureKeys = Object.keys(catalog?.features ?? {});
  const limitKeys = Object.keys(catalog?.limits ?? {});

  // For each feature: tri-state — inherit / force on / force off.
  const featState = (k: string): "inherit" | "on" | "off" => {
    if (!(k in featOverride)) return "inherit";
    return featOverride[k] ? "on" : "off";
  };
  const setFeatState = (k: string, s: "inherit" | "on" | "off") => {
    setFeatOverride((prev) => {
      const next = { ...prev };
      if (s === "inherit") delete next[k];
      else next[k] = s === "on";
      return next;
    });
  };

  // For limit: empty input → inherit; number → override.
  const limitVal = (k: string): string => k in limitOverride ? String(limitOverride[k]) : "";
  const setLimitVal = (k: string, v: string) => {
    setLimitOverride((prev) => {
      const next = { ...prev };
      if (v === "") delete next[k];
      else {
        const n = parseInt(v, 10);
        next[k] = Number.isNaN(n) ? 0 : n;
      }
      return next;
    });
  };

  const planEnt = plans.find((p) => p.id === planId)?.entitlements ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[95vh] overflow-auto rounded-xl bg-white p-5 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
              <ShieldCheck size={18} className="text-blue-600" />
              {t("admin.up_title")} — <span className="truncate">{user.email}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t("admin.up_effective_label")}{" "}
              <span className="font-mono text-slate-700">
                {effective?.plan_name ?? "—"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("admin.up_close")}
            className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Section 1: Tier + Domain + Role (3 lớp phân quyền page-level) */}
        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("admin.up_section1")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t("admin.up_role_tier_label")}
              </label>
              <select className="input" value={roleTier} onChange={(e) => setRoleTier(e.target.value)}>
                <option value="user">{t("admin.up_tier_user")}</option>
                <option value="admin">{t("admin.up_tier_admin")}</option>
                {isSuper && <option value="super_admin">{t("admin.up_tier_super")}</option>}
                <option value="support">{t("admin.up_tier_support")}</option>
              </select>
              <p className="text-xs text-slate-500 mt-1.5">
                <code className="rounded bg-slate-100 px-1">admin/super_admin</code> {t("admin.up_tier_hint1")}
                {" "}<code className="rounded bg-slate-100 px-1">user</code> {t("admin.up_tier_hint2")}
              </p>
            </div>
            {isSuper && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t("admin.up_domain_label")}
                </label>
                <select className="input" value={domainId} onChange={(e) => onDomainChange(e.target.value)}>
                  <option value="">{t("admin.up_domain_global")}</option>
                  {(domains ?? []).filter((d) => d.hostname !== "*").map((d) => (
                    <option key={d.id} value={d.id}>{d.hostname} — {d.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1.5">
                  {t("admin.up_domain_hint")}
                </p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("admin.up_role_label")}
            </label>
            <select
              className="input"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              disabled={!domainId}
            >
              <option value="">{t("admin.up_role_inherit")}</option>
              {(roles ?? []).filter((r) => r.status === "active").map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1.5">
              {t("admin.up_role_hint_pre")} <code className="rounded bg-slate-100 px-1">user</code>:
              {" "}{t("admin.up_role_hint_post")}
            </p>
          </div>
        </section>

        {/* Section 2: Plan + Overrides (feature/limit) */}
        <section className="space-y-3 border-t border-slate-100 pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t("admin.up_section2")}
          </h3>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("admin.up_plan_label")}
            </label>
            <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">{t("admin.up_plan_default")}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1.5">
              {t("admin.up_plan_hint")}
            </p>
          </div>
        </section>

        {!catalog ? null : (
        <section className="border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
            aria-expanded={showAdvanced}
          >
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                {t("admin.up_advanced_title")}
                {overrideCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                    {t("admin.up_active_count", { value: overrideCount })}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {t("admin.up_advanced_desc")}
              </p>
            </div>
            <ChevronDown
              size={18}
              className={`shrink-0 text-slate-400 transition ${showAdvanced ? "rotate-180" : ""}`}
            />
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-1">{t("admin.up_features")}</h3>
              <p className="text-xs text-slate-500 mb-3">
                {t("admin.up_features_hint_pre")} <strong>{t("admin.up_inherit")}</strong> ({t("admin.up_inherit_paren")}), <strong>{t("admin.up_on")}</strong>, <strong>{t("admin.up_off")}</strong>.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {featureKeys.map((k) => {
                  const planValue = (planEnt?.features ?? {})[k] ?? false;
                  const eff = effective?.features?.[k] ?? false;
                  return (
                    <div key={k} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{catalog.features[k]}</div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">{k}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {t("admin.up_plan_short")}: <span className={planValue ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
                            {planValue ? "✓" : "✗"}
                          </span>
                          {" · "}
                          {t("admin.up_effective_short")}: <span className={eff ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
                            {eff ? "✓" : "✗"}
                          </span>
                        </div>
                      </div>
                      <select
                        className="input py-1 text-xs w-28 shrink-0"
                        value={featState(k)}
                        onChange={(e) => setFeatState(k, e.target.value as any)}
                      >
                        <option value="inherit">{t("admin.up_inherit")}</option>
                        <option value="on">{t("admin.up_on")}</option>
                        <option value="off">{t("admin.up_off")}</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-1">{t("admin.up_limits")}</h3>
              <p className="text-xs text-slate-500 mb-3">
                {t("admin.up_limits_hint")}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {limitKeys.map((k) => {
                  const planValue = (planEnt?.limits ?? {})[k] ?? 0;
                  const eff = effective?.limits?.[k] ?? 0;
                  return (
                    <div key={k} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{catalog.limits[k]}</div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">{k}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {t("admin.up_plan_short")}: <span className="font-mono text-slate-700">{planValue}</span>
                          {" · "}{t("admin.up_effective_short")}: <span className="font-mono text-slate-700">{eff}</span>
                        </div>
                      </div>
                      <input
                        type="number" min={0}
                        className="input py-1 w-24 shrink-0"
                        placeholder={`(${planValue})`}
                        value={limitVal(k)}
                        onChange={(e) => setLimitVal(k, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          )}
        </section>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button onClick={onClose} className="btn-ghost">{t("admin.up_cancel")}</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
            {save.isPending ? t("admin.up_saving") : t("admin.up_save")}
          </button>
        </div>
      </div>
    </div>
  );
}
