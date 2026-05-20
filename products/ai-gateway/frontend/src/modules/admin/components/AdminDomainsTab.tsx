import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Globe, Plus } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import type { Domain } from "../models/domain";
import type { RoleLite } from "../models/role";
import { domainsService } from "../services/domains.service";
import { rolesService } from "../services/roles.service";
import { AdminDomainsTable } from "./AdminDomainsTable";
import { AdminDomainEditorModal } from "./AdminDomainEditorModal";

export function AdminDomainsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Domain | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: domains, isLoading } = useQuery({
    queryKey: ["admin-domains"],
    queryFn: () => domainsService.list(),
  });

  // Pull every role at once so we can group by domain_id without one
  // request per row. /api/admin/roles already returns user_count, which
  // we surface in the per-domain tooltip.
  const { data: roles } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => rolesService.listAll(),
  });

  const rolesByDomain = useMemo(() => {
    const map: Record<string, RoleLite[]> = {};
    for (const r of roles ?? []) {
      (map[r.domain_id] ||= []).push(r);
    }
    return map;
  }, [roles]);

  const remove = useMutation({
    mutationFn: (id: string) => domainsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-domains"] });
      toast(t("admin.domains_deleted_toast"), "success");
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail?.message ?? t("admin.domains_delete_error"), "error"),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Globe size={18} /> {t("admin.domains_title")}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("admin.domains_subtitle")}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> {t("admin.domains_create")}
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : (
        <AdminDomainsTable
          domains={domains ?? []}
          rolesByDomain={rolesByDomain}
          onEdit={setEditing}
          onDelete={(d) =>
            confirm(t("admin.domains_delete_confirm", { hostname: d.hostname })) &&
            remove.mutate(d.id)
          }
        />
      )}

      {(editing || creating) && (
        <AdminDomainEditorModal
          domain={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
