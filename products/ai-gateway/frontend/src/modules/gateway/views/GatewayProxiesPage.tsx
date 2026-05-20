import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { GitBranch, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { GatewayAuthGuard } from "../components/GatewayAuthGuard";
import { ErrorPanel } from "../components/ErrorPanel";
import { extractError } from "../utils/common";
import { proxiesService } from "../services/proxies.service";
import type { Proxy } from "../models/proxy";

export function GatewayProxiesPage() {
  return (
    <GatewayAuthGuard>
      <Inner />
    </GatewayAuthGuard>
  );
}

function Inner() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Proxy | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: proxies, isLoading, error } = useQuery({
    queryKey: ["gw-proxies"],
    queryFn: () => proxiesService.list(),
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => proxiesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-proxies"] });
      toast(t("gateway.gw_proxies_deleted"), "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <GitBranch size={22} /> {t("gateway.gw_proxies_title")}
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> {t("gateway.gw_proxies_create_btn")}
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">{t("gateway.gw_proxies_loading")}</p>
      ) : error ? (
        <ErrorPanel error={error} />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
              <tr>
                <th className="px-3 py-2">{t("gateway.gw_proxies_col_name")}</th>
                <th className="px-3 py-2">{t("gateway.gw_proxies_col_server")}</th>
                <th className="px-3 py-2">{t("gateway.gw_proxies_col_kind")}</th>
                <th className="px-3 py-2">{t("gateway.gw_proxies_col_country")}</th>
                <th className="px-3 py-2">{t("gateway.gw_proxies_col_sticky")}</th>
                <th className="px-3 py-2">{t("gateway.gw_proxies_col_enabled")}</th>
                <th className="px-3 py-2">{t("gateway.gw_proxies_col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(proxies ?? []).map((p) => (
                <tr key={p.id} className="border-t hover:bg-white">
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.server}:{p.port}</td>
                  <td className="px-3 py-2">{p.kind}</td>
                  <td className="px-3 py-2">{p.country ?? "—"}</td>
                  <td className="px-3 py-2">{p.sticky_session ? "✓" : "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${p.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {p.enabled ? t("gateway.gw_proxies_on") : t("gateway.gw_proxies_off")}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button className="btn-ghost" onClick={() => setEditing(p)}>
                      <Pencil size={14} className="inline mr-1" /> {t("gateway.gw_proxies_edit_btn")}
                    </button>
                    <button
                      className="btn-ghost text-rose-600"
                      onClick={() => confirm(t("gateway.gw_proxies_confirm_delete", { name: p.name })) && remove.mutate(p.id)}
                    >
                      <Trash2 size={14} className="inline mr-1" /> {t("gateway.gw_proxies_delete_btn")}
                    </button>
                  </td>
                </tr>
              ))}
              {(proxies ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    {t("gateway.gw_proxies_empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <ProxyEditorModal
          proxy={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function ProxyEditorModal({
  proxy, isCreate, onClose,
}: { proxy: Proxy | null; isCreate: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: proxy?.name ?? "",
      server: proxy?.server ?? "",
      port: proxy?.port ?? 8080,
      username: proxy?.username ?? "",
      password: proxy?.password ?? "",
      kind: proxy?.kind ?? "http",
      country: proxy?.country ?? "",
      sticky_session: proxy?.sticky_session ?? false,
      enabled: proxy?.enabled ?? true,
    },
  });

  const save = useMutation({
    mutationFn: async (v: any) => {
      const payload = {
        name: v.name,
        server: v.server,
        port: Number(v.port),
        username: v.username || null,
        password: v.password || null,
        kind: v.kind,
        country: v.country || null,
        sticky_session: v.sticky_session,
        enabled: v.enabled,
      };
      return isCreate
        ? proxiesService.create(payload)
        : proxiesService.update(proxy!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gw-proxies"] });
      toast(isCreate ? t("gateway.gw_proxies_created") : t("gateway.gw_proxies_saved"), "success");
      onClose();
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3"
      >
        <h2 className="text-lg font-semibold">{isCreate ? t("gateway.gw_proxies_modal_create") : t("gateway.gw_proxies_modal_edit", { name: proxy?.name })}</h2>

        <div>
          <label className="text-sm font-medium">{t("gateway.gw_proxies_field_name")}</label>
          <input className="input" {...register("name", { required: true })} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="text-sm font-medium">{t("gateway.gw_proxies_field_server")}</label>
            <input className="input font-mono" {...register("server", { required: true })}
              placeholder="proxy.example.com" />
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_proxies_field_port")}</label>
            <input className="input" type="number" {...register("port", { valueAsNumber: true })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_proxies_field_username")}</label>
            <input className="input" {...register("username")} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_proxies_field_password")}</label>
            <input className="input" type="password" {...register("password")} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_proxies_field_kind")}</label>
            <select className="input" {...register("kind")}>
              <option value="http">http</option>
              <option value="https">https</option>
              <option value="socks5">socks5</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">{t("gateway.gw_proxies_field_country")}</label>
            <input className="input" {...register("country")} placeholder="VN, US..." />
          </div>
        </div>

        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" {...register("sticky_session")} />
            {t("gateway.gw_proxies_sticky_label")}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" {...register("enabled")} />
            {t("gateway.gw_proxies_enabled_label")}
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">{t("gateway.gw_proxies_cancel")}</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? t("gateway.gw_proxies_saving") : isCreate ? t("gateway.gw_proxies_submit_create") : t("gateway.gw_proxies_submit_save")}
          </button>
        </div>
      </form>
    </div>
  );
}
