import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/Toast";
import type { Plan } from "../models/plan";
import { usersService } from "../services/users.service";
import { plansService } from "../services/plans.service";

export function PlanEditorModal({
  plan, isCreate, onClose,
}: { plan: Plan | null; isCreate: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: catalog } = useQuery({
    queryKey: ["admin-entitlement-catalog"],
    queryFn: () => usersService.entitlementCatalog(),
  });

  const [code, setCode] = useState(plan?.code ?? "");
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [isDefault, setIsDefault] = useState(plan?.is_default ?? false);
  const [sortOrder, setSortOrder] = useState(plan?.sort_order ?? 0);
  const [features, setFeatures] = useState<Record<string, boolean>>(
    () => plan?.entitlements?.features ?? {},
  );
  const [limits, setLimits] = useState<Record<string, number>>(
    () => plan?.entitlements?.limits ?? {},
  );

  useEffect(() => {
    if (!catalog) return;
    setFeatures((prev) => {
      const next = { ...prev };
      Object.keys(catalog.features).forEach((k) => { if (!(k in next)) next[k] = false; });
      return next;
    });
    setLimits((prev) => {
      const next = { ...prev };
      Object.keys(catalog.limits).forEach((k) => { if (!(k in next)) next[k] = 0; });
      return next;
    });
  }, [catalog]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code, name,
        description: description || null,
        is_default: isDefault,
        sort_order: sortOrder,
        entitlements: { features, limits },
      };
      return isCreate
        ? plansService.create(payload)
        : plansService.update(plan!.id, {
            name, description: description || null,
            is_default: isDefault, sort_order: sortOrder,
            entitlements: { features, limits },
          });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast(isCreate ? t("admin.plan_editor_created") : t("admin.plan_editor_saved"), "success");
      onClose();
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail?.message ?? t("admin.plan_editor_save_error"), "error");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl max-h-[95vh] overflow-auto rounded-lg bg-white p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isCreate
              ? t("admin.plan_editor_create_title")
              : t("admin.plan_editor_edit_title", { name: plan?.name ?? "" })}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">{t("admin.plan_editor_code")}</label>
            <input
              className="input font-mono" value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!isCreate}
              placeholder={t("admin.plan_editor_code_placeholder")}
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("admin.plan_editor_name_label")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">{t("admin.plan_editor_description_label")}</label>
          <input className="input" value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            {t("admin.plan_editor_is_default_label")}
          </label>
          <div>
            <label className="text-sm font-medium">{t("admin.plan_editor_sort_label")}</label>
            <input
              type="number" className="input"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value || "0", 10))}
            />
          </div>
        </div>

        {!catalog ? (
          <p className="text-slate-500">{t("admin.plan_editor_loading_catalog")}</p>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold mb-2">{t("admin.plan_editor_features")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(catalog.features).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 border rounded px-3 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={features[k] ?? false}
                      onChange={(e) => setFeatures({ ...features, [k]: e.target.checked })}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{label}</div>
                      <div className="text-xs text-slate-500 font-mono">{k}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">{t("admin.plan_editor_limits")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(catalog.limits).map(([k, label]) => (
                  <div key={k} className="flex items-center gap-2 border rounded px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{label}</div>
                      <div className="text-xs text-slate-500 font-mono">{k}</div>
                    </div>
                    <input
                      type="number" min={0}
                      className="input py-1 w-24"
                      value={limits[k] ?? 0}
                      onChange={(e) => setLimits({ ...limits, [k]: parseInt(e.target.value || "0", 10) })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          <button onClick={onClose} className="btn-ghost">{t("common.cancel")}</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
            {save.isPending
              ? t("common.saving")
              : isCreate
                ? t("admin.plan_editor_create_btn")
                : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
