import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { GitBranch, Plus, Pencil, Trash2, Key, X } from "lucide-react";
import { extractError } from "../utils/common";
import { poolsService } from "../services/pools.service";
import { vendorsService } from "../services/vendors.service";
import { functionsService } from "../services/functions.service";
import type { Pool } from "../models/pool";
import type { VendorRef } from "../models/vendor";
import type { GwFunctionRef } from "../models/function";
import { toast } from "@/components/ui/Toast";

export function GatewayPoolsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Pool | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: pools, isLoading } = useQuery({
    queryKey: ["gw-pools"],
    queryFn: () => poolsService.list(),
  });
  const { data: vendors } = useQuery({
    queryKey: ["gw-vendors"],
    queryFn: () => vendorsService.list(),
  });
  const { data: functions } = useQuery({
    queryKey: ["gw-functions"],
    queryFn: () => functionsService.list(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => poolsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-pools"] });
      toast(t("gateway.gw_pools_deleted"), "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <GitBranch size={22} /> {t("gateway.gw_pools_title")}
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> {t("gateway.gw_pools_create_btn")}
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr_1fr] gap-4">
        {/* Left: pool list */}
        <div className="card space-y-2">
          <h2 className="font-semibold">{t("gateway.gw_pools_list_title")}</h2>
          {isLoading ? (
            <p className="text-slate-500 text-sm">{t("gateway.gw_pools_loading")}</p>
          ) : (pools ?? []).length === 0 ? (
            <p className="text-slate-500 text-sm">{t("gateway.gw_pools_empty")}</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {pools!.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  className={`w-full text-left border rounded p-2 transition ${
                    activeId === p.id
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-200 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate">{p.name}</strong>
                    <span className={`text-xs px-2 py-0.5 rounded ${p.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {p.vendor_name} · {p.function_name ?? "—"}
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    {p.model ?? t("gateway.gw_pools_no_model")} · {t("gateway.gw_pools_keys_label")} {p.keys_active}/{p.keys_total}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Middle: keys inside selected pool */}
        <div className="card space-y-2">
          <h2 className="font-semibold flex items-center gap-1.5">
            <Key size={14} /> {t("gateway.gw_pools_keys_in_pool")}
          </h2>
          {activeId ? (
            <PoolKeysPanel poolId={activeId} />
          ) : (
            <p className="text-slate-500 text-sm">{t("gateway.gw_pools_select_hint")}</p>
          )}
        </div>

        {/* Right: overview/actions */}
        <div className="card space-y-2">
          <h2 className="font-semibold">{t("gateway.gw_pools_overview_title")}</h2>
          {pools && pools.length > 0 ? (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {pools.map((p) => (
                <div key={p.id} className="border border-slate-200 rounded p-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{p.name}</strong>
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(p)} className="btn-ghost text-xs" title={t("gateway.gw_pools_edit_title")}>
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => confirm(t("gateway.gw_pools_confirm_delete", { name: p.name })) && remove.mutate(p.id)}
                        className="btn-ghost text-rose-600 text-xs"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{p.vendor_name}</div>
                  <div className="text-xs">{t("gateway.gw_pools_model_label")} <span className="font-mono">{p.model ?? "n/a"}</span></div>
                  <div className="text-xs">{t("gateway.gw_pools_api_keys_label")} {p.keys_active}/{p.keys_total}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">{t("gateway.gw_pools_empty_short")}</p>
          )}
        </div>
      </div>

      {(editing || creating) && (
        <PoolEditorModal
          pool={editing}
          isCreate={creating}
          vendors={vendors ?? []}
          functions={functions ?? []}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function PoolKeysPanel({ poolId }: { poolId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["gw-pool-keys", poolId],
    queryFn: () => poolsService.listKeys(poolId),
  });

  const remove = useMutation({
    mutationFn: (kid: string) => poolsService.removeKey(poolId, kid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-pool-keys", poolId] });
      qc.invalidateQueries({ queryKey: ["gw-pools"] });
      toast(t("gateway.gw_pools_key_deleted"), "success");
    },
  });

  return (
    <div className="space-y-3">
      {creating && (
        <AddKeyForm poolId={poolId} onDone={() => {
          qc.invalidateQueries({ queryKey: ["gw-pool-keys", poolId] });
          qc.invalidateQueries({ queryKey: ["gw-pools"] });
          setCreating(false);
        }} />
      )}
      {!creating && (
        <button onClick={() => setCreating(true)} className="btn-primary w-full inline-flex items-center justify-center gap-1.5">
          <Plus size={14} /> {t("gateway.gw_pools_add_key")}
        </button>
      )}
      {isLoading ? (
        <p className="text-slate-500 text-sm">{t("gateway.gw_pools_loading")}</p>
      ) : (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {(keys ?? []).map((k) => (
            <div key={k.id} className="border border-slate-200 rounded p-2">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">{k.name}</strong>
                <span className={`text-xs px-2 py-0.5 rounded ${k.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {k.status}
                </span>
              </div>
              <div className="text-xs text-slate-500 font-mono">
                {k.key_prefix}… {k.project_id && `· ${k.project_id}`}
              </div>
              <div className="text-xs text-slate-500 flex items-center justify-between mt-1">
                <span>{t("gateway.gw_pools_priority_calls", { priority: k.priority, value: k.used_count })}</span>
                <button
                  onClick={() => confirm(t("gateway.gw_pools_confirm_remove_key", { name: k.name })) && remove.mutate(k.id)}
                  className="text-rose-600 hover:underline"
                >
                  <X size={12} className="inline" /> {t("gateway.gw_pools_remove_btn")}
                </button>
              </div>
            </div>
          ))}
          {(keys ?? []).length === 0 && (
            <p className="text-slate-400 text-xs text-center py-2">{t("gateway.gw_pools_no_keys")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function AddKeyForm({ poolId, onDone }: { poolId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { name: "", api_key: "", project_id: "", priority: 100 },
  });
  const save = useMutation({
    mutationFn: (v: any) => poolsService.addKey(poolId, v),
    onSuccess: () => {
      toast(t("gateway.gw_pools_key_added"), "success");
      reset();
      onDone();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });
  return (
    <form onSubmit={handleSubmit((v) => save.mutate({ ...v, priority: Number(v.priority) }))} className="space-y-2 p-2 border border-slate-200 rounded bg-white">
      <input className="input text-sm" placeholder={t("gateway.gw_pools_addkey_name_ph")} {...register("name", { required: true })} />
      <input className="input text-sm font-mono" placeholder={t("gateway.gw_pools_addkey_apikey_ph")} type="password" {...register("api_key", { required: true })} />
      <div className="grid grid-cols-2 gap-2">
        <input className="input text-sm" placeholder={t("gateway.gw_pools_addkey_project_ph")} {...register("project_id")} />
        <input className="input text-sm" placeholder={t("gateway.gw_pools_addkey_priority_ph")} type="number" {...register("priority", { valueAsNumber: true })} />
      </div>
      <button type="submit" disabled={save.isPending} className="btn-primary text-sm w-full">
        {save.isPending ? t("gateway.gw_pools_saving") : t("gateway.gw_pools_add_key")}
      </button>
    </form>
  );
}

function PoolEditorModal({
  pool, isCreate, vendors, functions, onClose,
}: {
  pool: Pool | null; isCreate: boolean;
  vendors: VendorRef[]; functions: GwFunctionRef[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      vendor_id: pool?.vendor_id ?? "",
      function_id: pool?.function_id ?? "",
      code: pool?.code ?? "",
      name: pool?.name ?? "",
      model: pool?.model ?? "",
      description: pool?.description ?? "",
      status: pool?.status ?? "active",
      cooldown_seconds: (pool as any)?.cooldown_seconds ?? 300,
      cost_per_million_input_cents: (pool as any)?.cost_per_million_input_cents ?? 0,
      cost_per_million_output_cents: (pool as any)?.cost_per_million_output_cents ?? 0,
    },
  });
  const save = useMutation({
    mutationFn: (v: any) => {
      const payload = {
        ...v,
        function_id: v.function_id || null,
        cooldown_seconds: Number(v.cooldown_seconds),
        cost_per_million_input_cents: Number(v.cost_per_million_input_cents),
        cost_per_million_output_cents: Number(v.cost_per_million_output_cents),
      };
      return isCreate
        ? poolsService.create(payload)
        : poolsService.update(pool!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-pools"] });
      toast(isCreate ? t("gateway.gw_pools_created") : t("gateway.gw_pools_saved"), "success");
      onClose();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">{isCreate ? t("gateway.gw_pools_modal_create") : t("gateway.gw_pools_modal_edit", { name: pool?.name })}</h2>
        <div>
          <label className="text-sm font-medium">{t("gateway.gw_pools_field_vendor")}</label>
          <select className="input" {...register("vendor_id", { required: true })} disabled={!isCreate}>
            <option value="">{t("gateway.gw_pools_opt_select_vendor")}</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">{t("gateway.gw_pools_field_function")}</label>
          <select className="input" {...register("function_id")}>
            <option value="">{t("gateway.gw_pools_opt_no_function")}</option>
            {functions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_pools_field_name")}</label>
            <input className="input" {...register("name", { required: true })} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_pools_field_code")}</label>
            <input className="input font-mono" {...register("code", { required: true })} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">{t("gateway.gw_pools_field_model")}</label>
          <input className="input font-mono" {...register("model")} placeholder="gemini-2.5-flash" />
        </div>
        <div>
          <label className="text-sm font-medium">{t("gateway.gw_pools_field_description")}</label>
          <textarea className="input" rows={2} {...register("description")} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_pools_field_status")}</label>
            <select className="input" {...register("status")}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_pools_field_cooldown")}</label>
            <input className="input" type="number" min={10} max={86400}
              {...register("cooldown_seconds", { valueAsNumber: true })} />
            <p className="text-[10px] text-slate-500 mt-0.5">
              {t("gateway.gw_pools_cooldown_hint")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t pt-3">
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_pools_field_cost_input")}</label>
            <input className="input" type="number" min={0}
              {...register("cost_per_million_input_cents", { valueAsNumber: true })} />
            <p className="text-[10px] text-slate-500 mt-0.5">
              {t("gateway.gw_pools_cost_input_hint")}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_pools_field_cost_output")}</label>
            <input className="input" type="number" min={0}
              {...register("cost_per_million_output_cents", { valueAsNumber: true })} />
            <p className="text-[10px] text-slate-500 mt-0.5">
              {t("gateway.gw_pools_cost_output_hint")}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">{t("gateway.gw_pools_cancel")}</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? t("gateway.gw_pools_saving") : isCreate ? t("gateway.gw_pools_submit_create") : t("gateway.gw_pools_submit_save")}
          </button>
        </div>
      </form>
    </div>
  );
}
