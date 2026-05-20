import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Sliders, Ban, UserCheck, Trash2, UserPlus } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import type { AdminUser } from "../models/user";
import type { Plan } from "../models/plan";
import { usersService } from "../services/users.service";
import { plansService } from "../services/plans.service";
import { CreateUserModal } from "./CreateUserModal";
import { UserPermissionsModal } from "./UserPermissionsModal";

// ============================================================================
// USERS TAB
// ============================================================================

export function UsersTab({ meId }: { meId: string }) {
  const { t } = useTranslation();
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => usersService.list(),
  });
  const { data: plans } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => plansService.list(),
  });
  const [open, setOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  const planByCode = useMemo(() => {
    const m: Record<string, Plan> = {};
    (plans ?? []).forEach((p) => { m[p.id] = p; });
    return m;
  }, [plans]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Users</h2>
        <button onClick={() => setOpen(true)} className="btn-primary inline-flex items-center gap-1.5">
          <UserPlus size={16} />
          {t("common.create_user")}
        </button>
      </div>
      {isLoading ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2">{t("tables.th_email")}</th>
                <th className="px-4 py-2">{t("tables.th_full_name")}</th>
                <th className="px-4 py-2">{t("tables.th_role")}</th>
                <th className="px-4 py-2">{t("tables.th_plan")}</th>
                <th className="px-4 py-2">Override</th>
                <th className="px-4 py-2">{t("tables.th_status")}</th>
                <th className="px-4 py-2">{t("tables.th_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <UserRow
                  key={u.id}
                  u={u}
                  meId={meId}
                  planLabel={u.plan_id ? planByCode[u.plan_id]?.name ?? "—" : "(default)"}
                  onEditPerms={() => setEditingUser(u)}
                  t={t}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <CreateUserModal plans={plans ?? []} onClose={() => setOpen(false)} />}
      {editingUser && (
        <UserPermissionsModal
          user={editingUser}
          plans={plans ?? []}
          onClose={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}

function UserRow({
  u, meId, planLabel, onEditPerms, t,
}: {
  u: AdminUser;
  meId: string;
  planLabel: string;
  onEditPerms: () => void;
  t: (k: string) => string;
}) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (patch: Partial<AdminUser>) => usersService.update(u.id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast(t("common.saved"), "success"); },
  });
  const remove = useMutation({
    mutationFn: () => usersService.remove(u.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast(t("common.deleted_ok"), "success"); },
  });
  const hasOverride = u.entitlement_overrides && Object.keys(u.entitlement_overrides).length > 0;
  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-2 font-medium text-slate-800">{u.email}</td>
      <td className="px-4 py-2 text-slate-700">{u.full_name || "—"}</td>
      <td className="px-4 py-2">
        <select className="input py-1" defaultValue={u.role} onChange={(e) => update.mutate({ role: e.target.value })}>
          <option value="user">user</option>
          <option value="admin">admin</option>
          <option value="super_admin">super_admin</option>
          <option value="support">support</option>
        </select>
      </td>
      <td className="px-4 py-2 text-slate-700">{planLabel}</td>
      <td className="px-4 py-2">
        {hasOverride ? (
          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">{t("common.yes")}</span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-2"><StatusBadge status={u.status} /></td>
      <td className="px-4 py-2 space-x-2 whitespace-nowrap">
        <button className="btn-ghost" onClick={onEditPerms} title={t("common.permissions")}>
          <Sliders size={14} className="inline mr-1" />
          {t("common.permissions")}
        </button>
        {u.status === "active" ? (
          <button
            className="btn-ghost text-amber-600"
            onClick={() => update.mutate({ status: "banned" })}
            title={t("common.deactivate")}
          >
            <Ban size={14} className="inline mr-1" />
            {t("common.ban")}
          </button>
        ) : (
          <button
            className="btn-ghost text-emerald-600"
            onClick={() => update.mutate({ status: "active" })}
            title={t("common.activate")}
          >
            <UserCheck size={14} className="inline mr-1" />
            {t("common.activate")}
          </button>
        )}
        {u.id !== meId && (
          <button
            className="btn-ghost text-rose-600"
            onClick={() => confirm(`${t("common.confirm_delete")} ${u.email}`) && remove.mutate()}
            title={t("common.delete")}
          >
            <Trash2 size={14} className="inline mr-1" />
            {t("common.delete")}
          </button>
        )}
      </td>
    </tr>
  );
}
