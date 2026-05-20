import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Code2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { GatewayAuthGuard } from "../components/GatewayAuthGuard";
import { ErrorPanel } from "../components/ErrorPanel";
import { CreatedKeyAlert } from "../components/CreatedKeyAlert";
import { extractError } from "../utils/common";
import { apiKeysService } from "../services/apiKeys.service";
import type { ApiKeyCreated } from "../models/apiKey";

export function GatewayApiKeysPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);

  const { data: keys, isLoading, error } = useQuery({
    queryKey: ["gw-api-keys"],
    queryFn: () => apiKeysService.list(),
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiKeysService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-api-keys"] });
      toast(t("gateway.gw_apikeys_deleted"), "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <Code2 size={22} /> {t("gateway.gw_apikeys_title")}
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> {t("gateway.gw_apikeys_create_btn")}
        </button>
      </div>

      {createdKey && (
        <CreatedKeyAlert
          title={t("gateway.gw_apikeys_created_title", { name: createdKey.name })}
          description={t("gateway.gw_apikeys_created_desc")}
          plainKey={createdKey.plain_key}
          onClose={() => setCreatedKey(null)}
        />
      )}

      {isLoading ? (
        <p className="text-slate-500">{t("gateway.gw_apikeys_loading")}</p>
      ) : error ? (
        <ErrorPanel error={error} />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
              <tr>
                <th className="px-3 py-2">{t("gateway.gw_apikeys_col_name")}</th>
                <th className="px-3 py-2">{t("gateway.gw_apikeys_col_prefix")}</th>
                <th className="px-3 py-2">{t("gateway.gw_apikeys_col_rate")}</th>
                <th className="px-3 py-2">{t("gateway.gw_apikeys_col_categories")}</th>
                <th className="px-3 py-2">{t("gateway.gw_apikeys_col_active")}</th>
                <th className="px-3 py-2">{t("gateway.gw_apikeys_col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(keys ?? []).map((k) => (
                <tr key={k.id} className="border-t hover:bg-white">
                  <td className="px-3 py-2 font-medium">{k.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{k.key_prefix}…</td>
                  <td className="px-3 py-2">{k.rate_limit_per_minute}</td>
                  <td className="px-3 py-2 text-xs">{k.allowed_categories.join(", ") || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${k.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {k.is_active ? t("gateway.gw_apikeys_status_active") : t("gateway.gw_apikeys_status_off")}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button
                      className="btn-ghost text-rose-600"
                      onClick={() => confirm(t("gateway.gw_apikeys_confirm_delete", { name: k.name })) && remove.mutate(k.id)}
                    >
                      <Trash2 size={14} className="inline mr-1" /> {t("gateway.gw_apikeys_delete_btn")}
                    </button>
                  </td>
                </tr>
              ))}
              {(keys ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    {t("gateway.gw_apikeys_empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={(key) => {
            setCreatedKey(key);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function CreateModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (k: ApiKeyCreated) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: "",
      rate_limit_per_minute: 60,
      allowed_categories: "grok",
      notes: "",
    },
  });

  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        rate_limit_per_minute: Number(v.rate_limit_per_minute),
        allowed_categories: v.allowed_categories
          ? v.allowed_categories.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [],
        notes: v.notes || null,
      };
      return apiKeysService.create(payload);
    },
    onSuccess: (key) => {
      qc.invalidateQueries({ queryKey: ["gw-api-keys"] });
      onCreated(key);
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3"
      >
        <h2 className="text-lg font-semibold">{t("gateway.gw_apikeys_modal_title")}</h2>

        <div>
          <label className="text-sm font-medium">{t("gateway.gw_apikeys_field_name")}</label>
          <input className="input" {...register("name", { required: true })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_apikeys_field_rate")}</label>
            <input className="input" type="number" min={1} max={10000}
              {...register("rate_limit_per_minute", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_apikeys_field_categories")}</label>
            <input className="input" {...register("allowed_categories")}
              placeholder="grok, flow" />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">{t("gateway.gw_apikeys_field_notes")}</label>
          <textarea className="input" rows={2} {...register("notes")} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">{t("gateway.gw_apikeys_cancel")}</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? t("gateway.gw_apikeys_creating") : t("gateway.gw_apikeys_create_submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

