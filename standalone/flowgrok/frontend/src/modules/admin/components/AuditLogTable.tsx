import { useTranslation } from "react-i18next";
import type { AuditLog } from "../models/auditLog";
import type { AuditFilterState } from "./AuditLogFilterBar";

interface DomainRef { id: string; hostname: string }

export function AuditLogTable({
  rows, isSelf, domains, pending, params, setPending, setParams, setOffset,
}: {
  rows: AuditLog[];
  isSelf: boolean;
  domains: DomainRef[];
  pending: AuditFilterState;
  params: AuditFilterState;
  setPending: (next: AuditFilterState) => void;
  setParams: (next: AuditFilterState) => void;
  setOffset: (n: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="bg-white text-left">
          <tr>
            <th className="px-3 py-2">{t("admin.audit_table_time")}</th>
            <th className="px-3 py-2">{t("admin.audit_table_action")}</th>
            <th className="px-3 py-2">{t("admin.audit_table_target")}</th>
            <th className="px-3 py-2">{t("admin.audit_table_user")}</th>
            {!isSelf && <th className="px-3 py-2">{t("admin.audit_table_domain")}</th>}
            <th className="px-3 py-2">{t("admin.audit_table_ip")}</th>
            <th className="px-3 py-2">{t("admin.audit_table_metadata")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id} className="border-t hover:bg-white">
              <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                {new Date(l.created_at).toLocaleString("vi-VN")}
              </td>
              <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-700">
                {l.action}
              </td>
              <td className="px-3 py-2 text-xs">
                {l.target_type ? (
                  <button
                    type="button"
                    className="cursor-pointer text-slate-700 hover:text-violet-600"
                    onClick={() => {
                      if (l.target_id) {
                        setPending({ ...pending, target_id: l.target_id, target_type: l.target_type ?? "" });
                        setParams({ ...params, target_id: l.target_id, target_type: l.target_type ?? "" });
                        setOffset(0);
                      }
                    }}
                    title={t("admin.audit_table_filter_target_title")}
                  >
                    {l.target_type}:{l.target_id?.slice(0, 8)}
                  </button>
                ) : "—"}
              </td>
              <td className="px-3 py-2 text-xs">
                {l.user_email ? (
                  <button
                    type="button"
                    className="text-left hover:text-violet-600"
                    onClick={() => {
                      if (l.user_id) {
                        setPending({ ...pending, user_id: l.user_id });
                        setParams({ ...params, user_id: l.user_id });
                        setOffset(0);
                      }
                    }}
                  >
                    <span className="block truncate font-medium text-slate-700">
                      {l.user_email}
                    </span>
                    {l.user_role && (
                      <span className="text-[10px] uppercase text-slate-400">{l.user_role}</span>
                    )}
                  </button>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              {!isSelf && (
                <td className="px-3 py-2 text-xs">
                  {l.domain_id ? (
                    <span className="font-mono text-slate-500">
                      {domains.find((d) => d.id === l.domain_id)?.hostname
                        ?? l.domain_id.slice(0, 8)}
                    </span>
                  ) : "—"}
                </td>
              )}
              <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                {l.ip_address ?? "—"}
              </td>
              <td className="max-w-md px-3 py-2 font-mono text-[11px] text-slate-500">
                {l.metadata ? (
                  <details>
                    <summary className="cursor-pointer truncate">
                      {JSON.stringify(l.metadata).slice(0, 80)}
                      {JSON.stringify(l.metadata).length > 80 ? "…" : ""}
                    </summary>
                    <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap rounded bg-white p-2">
                      {JSON.stringify(l.metadata, null, 2)}
                    </pre>
                  </details>
                ) : "—"}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={isSelf ? 6 : 7} className="px-4 py-8 text-center text-slate-500">
                {t("admin.audit_table_empty")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
