import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Code2, Plus, Pencil, Trash2 } from "lucide-react";
import { extractError } from "../utils/common";
import { functionsService } from "../services/functions.service";
import type { GwFunction } from "../models/function";
import { toast } from "@/components/ui/Toast";

export function GatewayFunctionsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<GwFunction | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["gw-functions"],
    queryFn: () => functionsService.list(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => functionsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-functions"] });
      toast(t("gateway.gw_functions_deleted"), "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <Code2 size={22} /> {t("gateway.gw_functions_title")}
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> {t("gateway.gw_functions_create_btn")}
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">{t("gateway.gw_functions_loading")}</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
              <tr>
                <th className="px-3 py-2">{t("gateway.gw_functions_col_code")}</th>
                <th className="px-3 py-2">{t("gateway.gw_functions_col_name")}</th>
                <th className="px-3 py-2">{t("gateway.gw_functions_col_type")}</th>
                <th className="px-3 py-2">{t("gateway.gw_functions_col_description")}</th>
                <th className="px-3 py-2">{t("gateway.gw_functions_col_status")}</th>
                <th className="px-3 py-2">{t("gateway.gw_functions_col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((f) => (
                <tr key={f.id} className="border-t hover:bg-white">
                  <td className="px-3 py-2 font-mono text-xs">{f.code}</td>
                  <td className="px-3 py-2 font-medium">{f.name}</td>
                  <td className="px-3 py-2">{f.function_type}</td>
                  <td className="px-3 py-2 text-slate-600">{f.description ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${f.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {f.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button onClick={() => setEditing(f)} className="btn-ghost text-xs">
                      <Pencil size={12} className="inline mr-1" /> {t("gateway.gw_functions_edit_btn")}
                    </button>
                    <button
                      onClick={() => confirm(t("gateway.gw_functions_confirm_delete", { name: f.name })) && remove.mutate(f.id)}
                      className="btn-ghost text-rose-600 text-xs"
                    >
                      <Trash2 size={12} className="inline mr-1" /> {t("gateway.gw_functions_delete_btn")}
                    </button>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">{t("gateway.gw_functions_empty")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <Editor func={editing} isCreate={creating} onClose={() => { setEditing(null); setCreating(false); }} />
      )}
    </div>
  );
}

function Editor({ func, isCreate, onClose }: { func: GwFunction | null; isCreate: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      code: func?.code ?? "",
      name: func?.name ?? "",
      function_type: func?.function_type ?? "image",
      description: func?.description ?? "",
      status: func?.status ?? "active",
    },
  });
  const save = useMutation({
    mutationFn: (v: any) =>
      isCreate
        ? functionsService.create(v)
        : functionsService.update(func!.id, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-functions"] });
      toast(isCreate ? t("gateway.gw_functions_created") : t("gateway.gw_functions_saved"), "success");
      onClose();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">{isCreate ? t("gateway.gw_functions_modal_create") : t("gateway.gw_functions_modal_edit", { name: func?.name })}</h2>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_functions_field_code")}</label>
            <input className="input font-mono" {...register("code", { required: true })} disabled={!isCreate} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_functions_field_type")}</label>
            <select className="input" {...register("function_type")}>
              <option value="image">image</option>
              <option value="video">video</option>
              <option value="text">text</option>
              <option value="audio">audio</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">{t("gateway.gw_functions_field_name")}</label>
          <input className="input" {...register("name", { required: true })} />
        </div>
        <div>
          <label className="text-sm font-medium">{t("gateway.gw_functions_field_description")}</label>
          <textarea className="input" rows={2} {...register("description")} />
        </div>
        <div>
          <label className="text-sm font-medium">{t("gateway.gw_functions_field_status")}</label>
          <select className="input" {...register("status")}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">{t("gateway.gw_functions_cancel")}</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? t("gateway.gw_functions_saving") : isCreate ? t("gateway.gw_functions_submit_create") : t("gateway.gw_functions_submit_save")}
          </button>
        </div>
      </form>
    </div>
  );
}
