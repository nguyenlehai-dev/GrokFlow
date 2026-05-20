import { useTranslation } from "react-i18next";
import { Globe, Mail, Trash2, Ban, Key } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ApiKey } from "../models/apiKey";

export function ApiKeysEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
      <Key size={32} className="mx-auto text-slate-400" />
      <p className="mt-2">{t("admin.apikey_table_empty_filtered")}</p>
    </div>
  );
}

export function ApiKeyDomainGroup({
  hostname, items, onRevoke, onDelete,
}: {
  hostname: string;
  items: ApiKey[];
  onRevoke: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const active = items.filter((k) => k.status === "active").length;
  return (
    <div className="rounded-lg ring-1 ring-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center gap-2">
        <Globe size={14} className="text-violet-600" />
        <span className="font-mono text-sm font-semibold text-slate-800">{hostname}</span>
        <span className="text-xs text-slate-500">
          {t("admin.apikey_table_count_summary", { total: items.length, active })}
        </span>
      </div>
      <ApiKeysTable items={items} showOwner showDomain={false} onRevoke={onRevoke} onDelete={onDelete} embedded />
    </div>
  );
}

export function ApiKeysTable({
  items, showOwner, showDomain = true, onRevoke, onDelete, embedded = false,
}: {
  items: ApiKey[];
  showOwner: boolean;
  showDomain?: boolean;
  onRevoke: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={embedded ? "overflow-x-auto" : "rounded-lg ring-1 ring-slate-200 bg-white overflow-x-auto"}>
      <table className="w-full text-sm">
        <thead className="bg-white text-left">
          <tr>
            <th className="px-4 py-2">{t("admin.apikey_table_col_name")}</th>
            {showOwner && <th className="px-4 py-2">{t("admin.apikey_table_col_owner")}</th>}
            {showDomain && <th className="px-4 py-2">{t("admin.apikey_table_col_domain")}</th>}
            <th className="px-4 py-2">{t("admin.apikey_table_col_scope")}</th>
            <th className="px-4 py-2">{t("admin.apikey_table_col_usage")}</th>
            <th className="px-4 py-2">{t("admin.apikey_table_col_status")}</th>
            <th className="px-4 py-2 text-right">{t("admin.apikey_table_col_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                {t("admin.apikey_table_no_keys")}
              </td>
            </tr>
          )}
          {items.map((k) => {
            const usagePct = k.daily_limit > 0 ? (k.used_today / k.daily_limit) * 100 : 0;
            return (
              <tr key={k.id} className="border-t border-slate-200 hover:bg-white align-top">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-800">{k.name}</div>
                  <code className="text-[11px] font-mono text-slate-500">{k.key_prefix}…</code>
                </td>
                {showOwner && (
                  <td className="px-4 py-2.5 text-xs">
                    <div className="inline-flex items-center gap-1 text-slate-700">
                      <Mail size={11} className="text-slate-400" />
                      {k.user_email ?? <span className="italic text-slate-400">{t("admin.apikey_table_deleted")}</span>}
                    </div>
                  </td>
                )}
                {showDomain && (
                  <td className="px-4 py-2.5 text-xs">
                    {k.domain_hostname ? (
                      <span className="inline-flex items-center gap-1 font-mono text-slate-700">
                        <Globe size={11} className="text-slate-400" />
                        {k.domain_hostname}
                      </span>
                    ) : (
                      <span className="italic text-slate-400">—</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-2.5 text-xs">
                  <div className="flex flex-wrap gap-1">
                    {(k.allowed_providers ?? []).map((p) => (
                      <span key={p} className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-mono text-[10px]">
                        {p}
                      </span>
                    ))}
                    {(k.allowed_job_types ?? []).map((jt) => (
                      <span key={jt} className="px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 font-mono text-[10px]">
                        {jt}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs">
                  <div className="font-mono text-slate-700">
                    {k.used_today}/{k.daily_limit}
                  </div>
                  <div className="mt-0.5 h-1 w-20 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full ${
                        usagePct >= 90 ? "bg-rose-500"
                          : usagePct >= 70 ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, usagePct)}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={k.status} />
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-1">
                  {k.status === "active" && (
                    <button
                      onClick={() => onRevoke(k.id)}
                      className="btn-ghost text-amber-700"
                      title={t("admin.apikey_table_revoke_title")}
                    >
                      <Ban size={13} className="inline mr-1" /> {t("admin.apikey_table_revoke")}
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(k.id, k.name)}
                    className="btn-ghost text-rose-600"
                    title={t("admin.apikey_table_delete_title")}
                  >
                    <Trash2 size={13} className="inline mr-1" /> {t("admin.apikey_table_delete")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
