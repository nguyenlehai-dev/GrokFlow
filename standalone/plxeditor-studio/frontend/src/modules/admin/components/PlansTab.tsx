import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Trash2, Pencil, Plus } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import type { Plan } from "../models/plan";
import { plansService } from "../services/plans.service";
import { PlanEditorModal } from "./PlanEditorModal";

export function PlansTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: plans, isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => plansService.list(),
  });
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = useMutation({
    mutationFn: (id: string) => plansService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast(t("admin.plans_deleted_toast"), "success");
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("admin.plans_title")}</h2>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={16} />
          {t("admin.plans_create")}
        </button>
      </div>
      {isLoading ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2">{t("admin.plans_code")}</th>
                <th className="px-4 py-2">{t("admin.plans_name")}</th>
                <th className="px-4 py-2">{t("admin.plans_default")}</th>
                <th className="px-4 py-2">{t("admin.plans_sort")}</th>
                <th className="px-4 py-2">{t("admin.plans_description")}</th>
                <th className="px-4 py-2">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {plans?.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2 font-mono">{p.code}</td>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2">{p.is_default ? "✓" : ""}</td>
                  <td className="px-4 py-2">{p.sort_order}</td>
                  <td className="px-4 py-2 text-slate-600">{p.description || "—"}</td>
                  <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                    <button className="btn-ghost" onClick={() => setEditing(p)} title={t("admin.plans_edit_title")}>
                      <Pencil size={14} className="inline mr-1" />
                      {t("common.edit")}
                    </button>
                    <button
                      className="btn-ghost text-rose-600"
                      onClick={() =>
                        confirm(t("admin.plans_delete_confirm", { name: p.name })) && remove.mutate(p.id)
                      }
                      title={t("admin.plans_delete_title")}
                    >
                      <Trash2 size={14} className="inline mr-1" />
                      {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(editing || creating) && (
        <PlanEditorModal
          plan={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
