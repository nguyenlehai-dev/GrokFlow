import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Shield, Users, Search, Copy } from "lucide-react";
import { useAuthStore } from "@/core/auth/store";
import { AdminGuard } from "../components/AdminGuard";
import { toast } from "@/components/ui/Toast";
import type { Role } from "../models/role";
import type { DomainForRoles as Domain } from "../models/domain";
import { rolesService } from "../services/roles.service";
import { domainsService } from "../services/domains.service";
import { RoleEditorModal } from "../components/RoleEditorModal";
import { RolesPagesCell } from "../components/RolesPagesCell";

export function AdminRolesPage() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}

function Inner() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";
  const qc = useQueryClient();
  const [filterDomain, setFilterDomain] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [duplicateFrom, setDuplicateFrom] = useState<Role | null>(null);

  const { data: domains } = useQuery<Domain[]>({
    queryKey: ["admin-domains"],
    queryFn: () => domainsService.listAs<Domain>(),
    // Domain admin can't read /api/admin/domains (super_admin only) — fall
    // back to a single-entry list derived from /me so the UI still works.
    enabled: isSuper,
  });

  const fallbackDomain: Domain | null = useMemo(() => {
    if (isSuper || !me?.domain_id) return null;
    return {
      id: me.domain_id,
      hostname: t("admin.roles_domain_yours"),
      label: t("admin.roles_domain_current"),
      allow_all_pages: false,
      allowed_pages: [],
    };
  }, [isSuper, me?.domain_id, t]);

  const effectiveDomains = isSuper ? (domains ?? []) : (fallbackDomain ? [fallbackDomain] : []);

  const { data: roles, isLoading } = useQuery<Role[]>({
    queryKey: ["admin-roles", filterDomain],
    queryFn: () => rolesService.list(filterDomain || undefined),
  });

  const remove = useMutation({
    mutationFn: (id: string) => rolesService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
      toast(t("admin.roles_deleted_toast"), "success");
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail?.message ?? t("admin.roles_delete_error"), "error"),
  });

  const domainLabel = (id: string) =>
    effectiveDomains.find((d) => d.id === id)?.hostname ?? id.slice(0, 8);

  const filteredRoles = useMemo(() => {
    let rs = roles ?? [];
    if (statusFilter !== "all") rs = rs.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rs = rs.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.description?.toLowerCase().includes(q) ?? false),
      );
    }
    return rs;
  }, [roles, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <Shield size={22} /> {t("admin.roles_title")}
        </h1>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={14} /> {t("admin.roles_create")}
        </button>
      </div>
      <p className="text-sm text-slate-500">{t("admin.roles_subtitle")}</p>

      {/* Filter bar — search + status + domain (super_admin only) */}
      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-slate-600">{t("admin.roles_search_label")}</label>
          <div className="mt-1 flex items-center rounded-md border border-slate-200 px-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
            <Search size={14} className="text-slate-400" />
            <input
              className="w-full bg-transparent px-2 py-1.5 text-sm outline-none"
              placeholder={t("admin.roles_search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">{t("admin.roles_status")}</label>
          <select
            className="input mt-1 w-32"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">{t("admin.roles_status_all")}</option>
            <option value="active">{t("admin.roles_status_active")}</option>
            <option value="disabled">{t("admin.roles_status_disabled")}</option>
          </select>
        </div>
        {isSuper && (
          <div className="min-w-[200px]">
            <label className="text-xs font-medium text-slate-600">{t("admin.roles_domain")}</label>
            <select
              className="input mt-1"
              value={filterDomain}
              onChange={(e) => setFilterDomain(e.target.value)}
            >
              <option value="">{t("admin.roles_domain_all")}</option>
              {effectiveDomains.filter((d) => d.hostname !== "*").map((d) => (
                <option key={d.id} value={d.id}>{d.hostname}</option>
              ))}
            </select>
          </div>
        )}
        <div className="text-xs text-slate-500">
          {t("admin.roles_count_summary", { shown: filteredRoles.length, total: roles?.length ?? 0 })}
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">{t("admin.roles_th_name_desc")}</th>
                <th className="px-3 py-2">{t("admin.roles_th_domain")}</th>
                <th className="px-3 py-2">{t("admin.roles_th_pages")}</th>
                <th className="px-3 py-2">{t("admin.roles_th_user")}</th>
                <th className="px-3 py-2">{t("admin.roles_th_status")}</th>
                <th className="px-3 py-2 text-right">{t("admin.roles_th_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoles.map((r) => (
                <tr key={r.id} className="border-t hover:bg-slate-50 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{r.name}</div>
                    {r.description && (
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-2 max-w-xs">
                        {r.description}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{domainLabel(r.domain_id)}</td>
                  <td className="px-3 py-2">
                    <RolesPagesCell paths={r.allowed_pages} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                      <Users size={11} /> {r.user_count}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${r.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap text-right">
                    <button
                      className="btn-ghost"
                      title={t("admin.roles_edit_title")}
                      onClick={() => setEditing(r)}
                    >
                      <Pencil size={14} className="inline mr-1" /> {t("common.edit")}
                    </button>
                    <button
                      className="btn-ghost"
                      title={t("admin.roles_copy_title")}
                      onClick={() => setDuplicateFrom(r)}
                    >
                      <Copy size={14} className="inline mr-1" /> {t("admin.roles_copy")}
                    </button>
                    <button
                      className="btn-ghost text-rose-600"
                      title={
                        r.user_count > 0
                          ? t("admin.roles_delete_inuse_title", { count: r.user_count })
                          : t("admin.roles_delete_title")
                      }
                      disabled={r.user_count > 0}
                      onClick={() =>
                        confirm(t("admin.roles_delete_confirm", { name: r.name })) && remove.mutate(r.id)
                      }
                    >
                      <Trash2 size={14} className="inline mr-1" /> {t("common.delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRoles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    {roles && roles.length > 0
                      ? t("admin.roles_empty_filter")
                      : t("admin.roles_empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating || duplicateFrom) && (
        <RoleEditorModal
          role={editing ?? (duplicateFrom ? {
            ...duplicateFrom,
            id: "",
            name: `${duplicateFrom.name} ${t("admin.roles_copy_suffix")}`,
            user_count: 0,
          } : null)}
          isCreate={creating || !!duplicateFrom}
          domains={effectiveDomains.filter((d) => d.hostname !== "*")}
          defaultDomainId={
            duplicateFrom?.domain_id ||
            filterDomain ||
            (isSuper ? "" : me?.domain_id ?? "")
          }
          onClose={() => {
            setEditing(null);
            setCreating(false);
            setDuplicateFrom(null);
          }}
        />
      )}
    </div>
  );
}
