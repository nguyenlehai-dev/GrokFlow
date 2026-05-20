import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Key, Plus, Pencil, Trash2 } from "lucide-react";
import { extractError } from "../utils/common";
import { gatewayKeysService } from "../services/gatewayKeys.service";
import { functionsService } from "../services/functions.service";
import { CreatedKeyAlert } from "../components/CreatedKeyAlert";
import type { GatewayKey, GatewayKeyCreated } from "../models/gatewayKey";
import type { GwFunctionRef } from "../models/function";
import { toast } from "@/components/ui/Toast";

export function GatewayKeysPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<GatewayKey | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<GatewayKeyCreated | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["gw-gateway-keys"],
    queryFn: () => gatewayKeysService.list(),
  });
  const { data: functions } = useQuery({
    queryKey: ["gw-functions"],
    queryFn: () => functionsService.list(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => gatewayKeysService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-gateway-keys"] });
      toast(t("gateway.gw_gwkeys_revoked"), "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <Key size={22} /> {t("gateway.gw_gwkeys_title")}
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> {t("gateway.gw_gwkeys_issue_btn")}
        </button>
      </div>

      {createdKey && (
        <CreatedKeyAlert
          title={t("gateway.gw_gwkeys_created_title", { name: createdKey.label })}
          description={t("gateway.gw_gwkeys_created_desc")}
          plainKey={createdKey.plain_key}
          onClose={() => setCreatedKey(null)}
        />
      )}

      {isLoading ? (
        <p className="text-slate-500">{t("gateway.gw_gwkeys_loading")}</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
              <tr>
                <th className="px-3 py-2">{t("gateway.gw_gwkeys_col_label")}</th>
                <th className="px-3 py-2">{t("gateway.gw_gwkeys_col_prefix")}</th>
                <th className="px-3 py-2">{t("gateway.gw_gwkeys_col_functions")}</th>
                <th className="px-3 py-2">{t("gateway.gw_gwkeys_col_rate")}</th>
                <th className="px-3 py-2">{t("gateway.gw_gwkeys_col_daily")}</th>
                <th className="px-3 py-2">{t("gateway.gw_gwkeys_col_webhook")}</th>
                <th className="px-3 py-2">{t("gateway.gw_gwkeys_col_status")}</th>
                <th className="px-3 py-2">{t("gateway.gw_gwkeys_col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((k) => (
                <tr key={k.id} className="border-t hover:bg-white">
                  <td className="px-3 py-2 font-medium">{k.label}</td>
                  <td className="px-3 py-2 font-mono text-xs">{k.prefix}…</td>
                  <td className="px-3 py-2 text-xs">{k.allowed_functions.length ? k.allowed_functions.join(", ") : "all"}</td>
                  <td className="px-3 py-2 font-mono">{k.rate_limit_per_minute}</td>
                  <td className="px-3 py-2 font-mono">{k.used_today}/{k.daily_quota || "∞"}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 max-w-xs truncate">
                    {k.webhook_url ? <span className="text-emerald-700">✓</span> : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${k.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {k.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button onClick={() => setEditing(k)} className="btn-ghost text-xs">
                      <Pencil size={12} className="inline mr-1" /> {t("gateway.gw_gwkeys_edit_btn")}
                    </button>
                    <button
                      onClick={() => confirm(t("gateway.gw_gwkeys_confirm_revoke", { name: k.label })) && remove.mutate(k.id)}
                      className="btn-ghost text-rose-600 text-xs"
                    >
                      <Trash2 size={12} className="inline mr-1" /> {t("gateway.gw_gwkeys_revoke_btn")}
                    </button>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">{t("gateway.gw_gwkeys_empty")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <EditorModal
          k={editing}
          isCreate={creating}
          functions={functions ?? []}
          onClose={() => { setEditing(null); setCreating(false); }}
          onCreated={(created) => { setCreatedKey(created); setCreating(false); }}
        />
      )}
    </div>
  );
}

function EditorModal({
  k, isCreate, functions, onClose, onCreated,
}: {
  k: GatewayKey | null;
  isCreate: boolean;
  functions: GwFunctionRef[];
  onClose: () => void;
  onCreated: (k: GatewayKeyCreated) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      label: k?.label ?? "",
      allowed_functions: (k?.allowed_functions ?? []).join(", "),
      webhook_url: k?.webhook_url ?? "",
      rate_limit_per_minute: k?.rate_limit_per_minute ?? 60,
      daily_quota: k?.daily_quota ?? 0,
      status: k?.status ?? "active",
    },
  });
  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        label: v.label,
        allowed_functions: v.allowed_functions
          ? v.allowed_functions.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [],
        webhook_url: v.webhook_url || null,
        rate_limit_per_minute: Number(v.rate_limit_per_minute),
        daily_quota: Number(v.daily_quota),
        status: v.status,
      };
      if (isCreate) {
        return gatewayKeysService.create(payload);
      }
      return gatewayKeysService.update(k!.id, payload);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["gw-gateway-keys"] });
      toast(isCreate ? t("gateway.gw_gwkeys_created") : t("gateway.gw_gwkeys_saved"), "success");
      if (isCreate && "plain_key" in (data as any)) {
        onCreated(data as GatewayKeyCreated);
      } else {
        onClose();
      }
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">{isCreate ? t("gateway.gw_gwkeys_modal_issue") : t("gateway.gw_gwkeys_modal_edit", { name: k?.label })}</h2>

        <div>
          <label className="text-sm font-medium">{t("gateway.gw_gwkeys_field_label")}</label>
          <input className="input" {...register("label", { required: true })} />
        </div>

        <div>
          <label className="text-sm font-medium">{t("gateway.gw_gwkeys_field_allowed_functions")}</label>
          <input className="input font-mono text-xs" {...register("allowed_functions")}
            placeholder="image_generation, text_generation" />
          <p className="text-[10px] text-slate-500 mt-0.5">
            {t("gateway.gw_gwkeys_field_allowed_hint", { codes: functions.map((f) => f.code).join(", ") })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_gwkeys_field_rate")}</label>
            <input className="input" type="number" min={1} max={10000}
              {...register("rate_limit_per_minute", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_gwkeys_field_daily")}</label>
            <input className="input" type="number" min={0}
              {...register("daily_quota", { valueAsNumber: true })} />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">{t("gateway.gw_gwkeys_field_webhook")}</label>
          <input className="input font-mono text-xs" {...register("webhook_url")}
            placeholder="https://your.app/gateway-webhook" />
        </div>

        {!isCreate && (
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_gwkeys_field_status")}</label>
            <select className="input" {...register("status")}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">{t("gateway.gw_gwkeys_cancel")}</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? t("gateway.gw_gwkeys_saving") : isCreate ? t("gateway.gw_gwkeys_submit_issue") : t("gateway.gw_gwkeys_submit_save")}
          </button>
        </div>
      </form>
    </div>
  );
}
