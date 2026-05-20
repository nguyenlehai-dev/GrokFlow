import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Shield, ArrowRight } from "lucide-react";
import type { Domain } from "../models/domain";
import type { RoleLite } from "../models/role";

export function AdminDomainsTable({
  domains, rolesByDomain, onEdit, onDelete,
}: {
  domains: Domain[];
  rolesByDomain: Record<string, RoleLite[]>;
  onEdit: (d: Domain) => void;
  onDelete: (d: Domain) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className="px-3 py-2">{t("admin.domains_hostname")}</th>
            <th className="px-3 py-2">{t("admin.domains_label")}</th>
            <th className="px-3 py-2">{t("admin.domains_status")}</th>
            <th className="px-3 py-2">{t("admin.domains_public_flags")}</th>
            <th className="px-3 py-2">{t("admin.domains_pages")}</th>
            <th className="px-3 py-2">{t("admin.domains_roles_col")}</th>
            <th className="px-3 py-2">{t("admin.domains_brand_col")}</th>
            <th className="px-3 py-2">{t("admin.domains_actions")}</th>
          </tr>
        </thead>
        <tbody>
          {domains.map((d) => (
            <tr key={d.id} className="border-t hover:bg-slate-50">
              <td className="px-3 py-2 font-mono text-xs">{d.hostname}</td>
              <td className="px-3 py-2 font-medium">{d.label}</td>
              <td className="px-3 py-2">
                <div className="flex flex-col gap-1">
                  <StatusPill status={d.status} />
                  {d.maintenance_mode && (
                    <span
                      className="badge-amber text-[10px] inline-flex w-fit"
                      title={d.maintenance_message || t("admin.domains_maintenance_default")}
                    >
                      🔧 Maintenance
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 space-x-1">
                <Flag on={d.allow_landing} label="landing" />
                <Flag on={d.allow_register} label="register" />
                <Flag on={d.allow_login} label="login" />
              </td>
              <td className="px-3 py-2 text-xs">
                {d.allow_all_pages ? (
                  <span className="text-emerald-700 font-medium">{t("admin.domains_all_pages")}</span>
                ) : (
                  <span className="text-slate-600">
                    {d.allowed_pages.length === 0
                      ? "—"
                      : `${d.allowed_pages.length} ${t("admin.domains_pages_count")}`}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                <RolesCell roles={rolesByDomain[d.id] ?? []} />
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">{d.brand_name ?? "—"}</td>
              <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                <button className="btn-ghost" onClick={() => onEdit(d)}>
                  <Pencil size={14} className="inline mr-1" /> {t("common.edit")}
                </button>
                {d.hostname !== "*" && (
                  <button
                    className="btn-ghost text-rose-600"
                    onClick={() => onDelete(d)}
                  >
                    <Trash2 size={14} className="inline mr-1" /> {t("common.delete")}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {domains.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                {t("admin.domains_empty")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
        on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400 line-through"
      }`}
    >
      {label}
    </span>
  );
}

/** Per-domain roles summary on the Domains list. Shows count + the first
 *  few role names as chips, with total user-count and a link to manage
 *  them. Empty state nudges admins to create one — roles are the standard
 *  way to scope a domain's user menu. */
function RolesCell({ roles }: { roles: RoleLite[] }) {
  const { t } = useTranslation();
  if (roles.length === 0) {
    return (
      <Link
        to="/admin/roles"
        className="inline-flex items-center gap-1 text-xs text-violet-600 hover:underline"
      >
        <Plus size={12} /> {t("admin.domains_create_role")}
      </Link>
    );
  }
  const totalUsers = roles.reduce((sum, r) => sum + r.user_count, 0);
  const tooltip = roles
    .map((r) => `• ${r.name}${r.status === "disabled" ? " (disabled)" : ""} — ${r.user_count} ${t("admin.domains_role_user_short")}`)
    .join("\n");
  const preview = roles.slice(0, 2);
  return (
    <div className="text-xs" title={tooltip}>
      <Link
        to="/admin/roles"
        className="inline-flex items-center gap-1 font-mono text-slate-700 hover:text-violet-600"
      >
        <Shield size={11} /> {roles.length} role · {totalUsers} {t("admin.domains_role_user_short")}
        <ArrowRight size={11} className="opacity-60" />
      </Link>
      <div className="mt-1 flex flex-wrap gap-1">
        {preview.map((r) => (
          <span
            key={r.id}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              r.status === "active"
                ? "bg-violet-50 text-violet-700"
                : "bg-slate-100 text-slate-500 line-through"
            }`}
          >
            {r.name}
          </span>
        ))}
        {roles.length > preview.length && (
          <span className="text-[10px] text-slate-400 self-center">
            +{roles.length - preview.length}
          </span>
        )}
      </div>
    </div>
  );
}
