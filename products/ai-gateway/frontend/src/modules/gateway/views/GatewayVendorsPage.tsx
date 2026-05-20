import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Boxes, Plus, Pencil, Trash2 } from "lucide-react";
import { extractError } from "../utils/common";
import { vendorsService } from "../services/vendors.service";
import type { Vendor } from "../models/vendor";
import { toast } from "@/components/ui/Toast";

export function GatewayVendorsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["gw-vendors"],
    queryFn: () => vendorsService.list(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => vendorsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-vendors"] });
      toast(t("gateway.gw_vendors_deleted"), "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <Boxes size={22} /> {t("gateway.gw_vendors_title")}
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> {t("gateway.gw_vendors_create_btn")}
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Form (full width on small) */}
        <div className="card space-y-3">
          <h2 className="font-semibold">{t("gateway.gw_vendors_create_title")}</h2>
          <p className="text-xs text-slate-500">
            {t("gateway.gw_vendors_create_hint")}
          </p>
          <InlineCreateForm onDone={() => qc.invalidateQueries({ queryKey: ["gw-vendors"] })} />
        </div>

        {/* List */}
        <div className="card space-y-2">
          <h2 className="font-semibold">{t("gateway.gw_vendors_list_title")}</h2>
          {isLoading ? (
            <p className="text-slate-500 text-sm">{t("gateway.gw_vendors_loading")}</p>
          ) : (vendors ?? []).length === 0 ? (
            <p className="text-slate-500 text-sm">{t("gateway.gw_vendors_empty")}</p>
          ) : (
            <div className="space-y-2">
              {vendors!.map((v) => (
                <div key={v.id} className="border border-slate-200 rounded p-3 hover:bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <strong>{v.name}</strong>
                        <span className={`text-xs px-2 py-0.5 rounded ${v.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {v.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {v.code} {v.short_name && `/ ${v.short_name}`}
                      </div>
                      {v.description && (
                        <p className="text-sm text-slate-600 mt-1">{v.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(v)} className="btn-ghost text-xs" title={t("gateway.gw_vendors_edit_title")}>
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => confirm(t("gateway.gw_vendors_confirm_delete", { name: v.name })) && remove.mutate(v.id)}
                        className="btn-ghost text-rose-600 text-xs"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(editing || creating) && (
        <VendorEditorModal
          vendor={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function InlineCreateForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { code: "", name: "", short_name: "", domain: "", description: "" },
  });
  const save = useMutation({
    mutationFn: (v: any) => vendorsService.create(v),
    onSuccess: () => {
      toast(t("gateway.gw_vendors_created"), "success");
      reset();
      onDone();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });
  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-2">
      <input className="input" placeholder={t("gateway.gw_vendors_name_ph")} {...register("name", { required: true })} />
      <div className="grid grid-cols-2 gap-2">
        <input className="input font-mono text-xs" placeholder={t("gateway.gw_vendors_code_ph")} {...register("code", { required: true })} />
        <input className="input font-mono text-xs" placeholder={t("gateway.gw_vendors_short_ph")} {...register("short_name")} />
      </div>
      <textarea className="input" rows={3} placeholder={t("gateway.gw_vendors_desc_ph")} {...register("description")} />
      <button type="submit" disabled={save.isPending} className="btn-primary w-full">
        {save.isPending ? t("gateway.gw_vendors_creating") : t("gateway.gw_vendors_create_btn")}
      </button>
    </form>
  );
}

function VendorEditorModal({
  vendor, isCreate, onClose,
}: { vendor: Vendor | null; isCreate: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      code: vendor?.code ?? "",
      name: vendor?.name ?? "",
      short_name: vendor?.short_name ?? "",
      domain: vendor?.domain ?? "",
      description: vendor?.description ?? "",
      status: vendor?.status ?? "active",
    },
  });
  const save = useMutation({
    mutationFn: (v: any) =>
      isCreate
        ? vendorsService.create(v)
        : vendorsService.update(vendor!.id, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-vendors"] });
      toast(isCreate ? t("gateway.gw_vendors_created_short") : t("gateway.gw_vendors_saved"), "success");
      onClose();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">{isCreate ? t("gateway.gw_vendors_modal_create") : t("gateway.gw_vendors_modal_edit", { name: vendor?.name })}</h2>
        <div>
          <label className="text-sm font-medium">{t("gateway.gw_vendors_field_name")}</label>
          <input className="input" {...register("name", { required: true })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_vendors_field_code")}</label>
            <input className="input font-mono" {...register("code", { required: true })} disabled={!isCreate} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_vendors_field_short")}</label>
            <input className="input font-mono" {...register("short_name")} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">{t("gateway.gw_vendors_field_domain")}</label>
          <input className="input" {...register("domain")} />
        </div>
        <div>
          <label className="text-sm font-medium">{t("gateway.gw_vendors_field_description")}</label>
          <textarea className="input" rows={2} {...register("description")} />
        </div>
        <div>
          <label className="text-sm font-medium">{t("gateway.gw_vendors_field_status")}</label>
          <select className="input" {...register("status")}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">{t("gateway.gw_vendors_cancel")}</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? t("gateway.gw_vendors_saving") : isCreate ? t("gateway.gw_vendors_submit_create") : t("gateway.gw_vendors_submit_save")}
          </button>
        </div>
      </form>
    </div>
  );
}
