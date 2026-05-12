import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router-dom";
import { ShieldCheck, Sliders, Ban, UserCheck, Trash2, Pencil, UserPlus, Plus } from "lucide-react";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { AdminBillingTab } from "./AdminBillingTab";
import { AdminDomainsTab } from "./AdminDomainsTab";

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
  plan_id: string | null;
  domain_id: string | null;
  entitlement_overrides: Record<string, unknown> | null;
}

interface Stats {
  total_users: number;
  total_api_keys: number;
  total_profiles: number;
  total_jobs: number;
  jobs_24h_success: number;
  jobs_24h_failed: number;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_default: boolean;
  sort_order: number;
  entitlements: { features?: Record<string, boolean>; limits?: Record<string, number> };
  created_at: string;
  updated_at: string;
}

interface Catalog {
  features: Record<string, string>;
  limits: Record<string, string>;
}

const NULL_PLAN_ID = "00000000-0000-0000-0000-000000000000";

export function AdminPage() {
  // Hooks MUST run before any conditional return — otherwise React throws
  // "Rendered more hooks than during the previous render" when the role
  // changes between render passes (e.g. /me refresh).
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const [tab, setTab] = useState<"users" | "plans" | "billing" | "domains">("users");
  // Re-fetch /me on mount: cached role from localStorage may be stale (e.g.
  // user logged in as admin earlier, then got demoted, then opened /admin
  // from cache → backend rejects with 403 even though the cached gate let
  // them through). Source of truth = backend.
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get("/api/auth/me");
        if (cancelled) return;
        setUser(r.data);
        if ((r.data?.role !== "admin" && r.data?.role !== "super_admin")) {
          toast("Tài khoản này không có quyền admin", "error");
          navigate("/dashboard", { replace: true });
          return;
        }
        setVerified(true);
      } catch (e: any) {
        if (e?.response?.status === 401) {
          clear();
          navigate("/login", { replace: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // While the cached role isn't admin we don't want to even mount the
  // queries (they'd 403). Render a redirect immediately.
  if ((me?.role !== "admin" && me?.role !== "super_admin")) return <Navigate to="/dashboard" replace />;

  // Wait for the fresh /me confirmation so admin queries don't fire with a
  // stale token (e.g. cache says admin, DB says user → 403).
  if (!verified) {
    return <p className="text-slate-500">Đang xác thực quyền admin...</p>;
  }

  const isSuper = me?.role === "super_admin";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <StatsBlock />
      <div className="flex gap-1 border-b">
        <TabButton active={tab === "users"} onClick={() => setTab("users")}>Users</TabButton>
        {isSuper && <TabButton active={tab === "plans"} onClick={() => setTab("plans")}>Plans / Gói</TabButton>}
        {isSuper && <TabButton active={tab === "billing"} onClick={() => setTab("billing")}>Billing</TabButton>}
        {isSuper && <TabButton active={tab === "domains"} onClick={() => setTab("domains")}>Domains</TabButton>}
      </div>
      {tab === "users" && <UsersTab meId={me.id} />}
      {tab === "plans" && <PlansTab />}
      {tab === "billing" && <AdminBillingTab />}
      {tab === "domains" && <AdminDomainsTab />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
        active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function StatsBlock() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get<Stats>("/api/admin/stats")).data,
  });
  if (!stats) return null;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Stat label="Users" value={stats.total_users} />
      <Stat label="API Keys" value={stats.total_api_keys} />
      <Stat label="Profiles" value={stats.total_profiles} />
      <Stat label="Tổng job" value={stats.total_jobs} />
      <Stat label="Job 24h success" value={stats.jobs_24h_success} accent="text-emerald-600" />
      <Stat label="Job 24h failed" value={stats.jobs_24h_failed} accent="text-rose-600" />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accent ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}

// ============================================================================
// USERS TAB
// ============================================================================

export function UsersTab({ meId }: { meId: string }) {
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await api.get<AdminUser[]>("/api/admin/users")).data,
  });
  const { data: plans } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => (await api.get<Plan[]>("/api/admin/plans")).data,
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
        <h2 className="text-lg font-semibold">Users</h2>
        <button onClick={() => setOpen(true)} className="btn-primary inline-flex items-center gap-1.5">
          <UserPlus size={16} />
          Tạo user
        </button>
      </div>
      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">Override</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Actions</th>
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
  u, meId, planLabel, onEditPerms,
}: { u: AdminUser; meId: string; planLabel: string; onEditPerms: () => void }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (patch: Partial<AdminUser>) => api.patch(`/api/admin/users/${u.id}`, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast("Đã cập nhật", "success"); },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/admin/users/${u.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast("Đã xóa user", "success"); },
  });
  const hasOverride = u.entitlement_overrides && Object.keys(u.entitlement_overrides).length > 0;
  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{u.email}</td>
      <td className="px-4 py-2">{u.full_name || "—"}</td>
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
          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">có</span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-2"><StatusBadge status={u.status} /></td>
      <td className="px-4 py-2 space-x-2 whitespace-nowrap">
        <button className="btn-ghost" onClick={onEditPerms} title="Đặt gói + override quyền">
          <Sliders size={14} className="inline mr-1" />
          Quyền
        </button>
        {u.status === "active" ? (
          <button
            className="btn-ghost text-amber-600"
            onClick={() => update.mutate({ status: "banned" })}
            title="Khóa tài khoản"
          >
            <Ban size={14} className="inline mr-1" />
            Ban
          </button>
        ) : (
          <button
            className="btn-ghost text-emerald-600"
            onClick={() => update.mutate({ status: "active" })}
            title="Kích hoạt lại tài khoản"
          >
            <UserCheck size={14} className="inline mr-1" />
            Activate
          </button>
        )}
        {u.id !== meId && (
          <button
            className="btn-ghost text-rose-600"
            onClick={() => confirm(`Xóa user ${u.email}?`) && remove.mutate()}
            title="Xóa user"
          >
            <Trash2 size={14} className="inline mr-1" />
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

// --- Create user modal -----------------------------------------------------

interface CreateValues {
  email: string;
  password: string;
  full_name: string;
  role: "super_admin" | "admin" | "user" | "support";
  plan_id: string;
  domain_id: string;
  role_id: string;
}

interface DomainOpt { id: string; hostname: string; label: string }
interface RoleOpt { id: string; name: string; domain_id: string; status: string }

function CreateUserModal({ plans, onClose }: { plans: Plan[]; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";
  const defaultPlan = plans.find((p) => p.is_default);
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm<CreateValues>({
    defaultValues: { role: "user", plan_id: defaultPlan?.id ?? "", domain_id: "", role_id: "" },
  });
  // Domain picker — super_admin only (backend forces the admin's domain otherwise).
  const { data: domains } = useQuery<DomainOpt[]>({
    queryKey: ["admin-domains"],
    queryFn: async () => (await api.get<DomainOpt[]>("/api/admin/domains")).data,
    enabled: isSuper,
  });
  // Roles list — for super_admin filtered by the picked domain; for domain
  // admin all roles in their own domain (backend scopes /api/admin/roles).
  const watchedDomainId = watch("domain_id");
  const targetDomainId = isSuper ? watchedDomainId : (me?.domain_id ?? "");
  const { data: roles } = useQuery<RoleOpt[]>({
    queryKey: ["admin-roles-for-create", targetDomainId],
    queryFn: async () => {
      const q = isSuper && targetDomainId ? `?domain_id=${targetDomainId}` : "";
      return (await api.get<RoleOpt[]>(`/api/admin/roles${q}`)).data;
    },
    enabled: !isSuper || !!targetDomainId,
  });
  const onSubmit = async (v: CreateValues) => {
    const payload: any = { ...v };
    if (!payload.plan_id) delete payload.plan_id;
    if (!payload.domain_id || !isSuper) delete payload.domain_id;
    if (!payload.role_id) delete payload.role_id;
    try {
      await api.post("/api/admin/users", payload);
    } catch (e: any) {
      const msg = e?.response?.data?.detail?.message ?? "Tạo user lỗi";
      toast(msg, "error");
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    toast("Đã tạo user", "success");
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">Tạo user mới</h2>
        <div>
          <label className="text-sm font-medium">Email</label>
          <input className="input" type="email" {...register("email", { required: true })} />
        </div>
        <div>
          <label className="text-sm font-medium">Password</label>
          <input className="input" type="password" {...register("password", { required: true, minLength: 8 })} />
        </div>
        <div>
          <label className="text-sm font-medium">Full name</label>
          <input className="input" {...register("full_name")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Role</label>
            <select className="input" {...register("role")}>
              <option value="user">user (khách)</option>
              <option value="admin">admin (per-domain)</option>
              {isSuper && <option value="super_admin">super_admin (global)</option>}
              <option value="support">support</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Plan</label>
            <select className="input" {...register("plan_id")}>
              <option value="">— mặc định —</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        {isSuper && (
          <div>
            <label className="text-sm font-medium">Domain</label>
            <select className="input" {...register("domain_id")}>
              <option value="">— Global (không gắn domain) —</option>
              {(domains ?? []).filter((d) => d.hostname !== "*").map((d) => (
                <option key={d.id} value={d.id}>{d.hostname} — {d.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Global = super_admin / không bị giới hạn theo domain. Chọn domain cụ thể để user/admin chỉ truy cập tài nguyên của domain đó.
            </p>
          </div>
        )}
        <div>
          <label className="text-sm font-medium">Role (per-domain)</label>
          <select className="input" {...register("role_id")}>
            <option value="">— Inherit domain pages —</option>
            {(roles ?? []).filter((r) => r.status === "active").map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Khi gán role: user chỉ thấy menu trong allowlist của role (giao với domain). Bỏ trống = thừa hưởng full menu của domain.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>Tạo</button>
        </div>
      </form>
    </div>
  );
}

// --- Per-user permissions modal --------------------------------------------

function UserPermissionsModal({
  user, plans, onClose,
}: { user: AdminUser; plans: Plan[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: catalog } = useQuery({
    queryKey: ["admin-entitlement-catalog"],
    queryFn: async () => (await api.get<Catalog>("/api/admin/entitlements/catalog")).data,
  });
  const { data: effective } = useQuery({
    queryKey: ["admin-user-effective", user.id],
    queryFn: async () =>
      (await api.get<{ features: Record<string, boolean>; limits: Record<string, number>; plan_code: string | null; plan_name: string | null }>(
        `/api/admin/users/${user.id}/effective-entitlements`,
      )).data,
  });

  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";

  const [planId, setPlanId] = useState<string>(user.plan_id ?? "");
  const [domainId, setDomainId] = useState<string>(user.domain_id ?? "");
  const [roleId, setRoleId] = useState<string>(user.role_id ?? "");
  const [featOverride, setFeatOverride] = useState<Record<string, boolean>>(
    () => (user.entitlement_overrides as any)?.features ?? {},
  );
  const [limitOverride, setLimitOverride] = useState<Record<string, number>>(
    () => (user.entitlement_overrides as any)?.limits ?? {},
  );

  // Domain list (super only — domain admin's choice is fixed to their own).
  const { data: domains } = useQuery<DomainOpt[]>({
    queryKey: ["admin-domains"],
    queryFn: async () => (await api.get<DomainOpt[]>("/api/admin/domains")).data,
    enabled: isSuper,
  });
  // Roles for the user's (current/edited) domain.
  const { data: roles } = useQuery<RoleOpt[]>({
    queryKey: ["admin-roles-for-user", domainId],
    queryFn: async () => {
      const q = isSuper && domainId ? `?domain_id=${domainId}` : "";
      return (await api.get<RoleOpt[]>(`/api/admin/roles${q}`)).data;
    },
    enabled: !!domainId,
  });

  // When domain changes, clear role (the role wouldn't be valid in the new
  // domain anyway — backend rejects it).
  const onDomainChange = (id: string) => {
    setDomainId(id);
    setRoleId("");
  };

  const save = useMutation({
    mutationFn: async () => {
      const overrides: any = {};
      if (Object.keys(featOverride).length) overrides.features = featOverride;
      if (Object.keys(limitOverride).length) overrides.limits = limitOverride;
      const body: any = {
        plan_id: planId || NULL_PLAN_ID,
        entitlement_overrides: overrides,
        // Zero-uuid sentinel clears the field (backend understands this).
        role_id: roleId || NULL_PLAN_ID,
      };
      if (isSuper) {
        body.domain_id = domainId || NULL_PLAN_ID;
      }
      return api.patch(`/api/admin/users/${user.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-user-effective", user.id] });
      toast("Đã lưu quyền", "success");
      onClose();
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail?.message ?? "Lưu lỗi", "error");
    },
  });

  const featureKeys = Object.keys(catalog?.features ?? {});
  const limitKeys = Object.keys(catalog?.limits ?? {});

  // For each feature: tri-state — inherit / force on / force off.
  const featState = (k: string): "inherit" | "on" | "off" => {
    if (!(k in featOverride)) return "inherit";
    return featOverride[k] ? "on" : "off";
  };
  const setFeatState = (k: string, s: "inherit" | "on" | "off") => {
    setFeatOverride((prev) => {
      const next = { ...prev };
      if (s === "inherit") delete next[k];
      else next[k] = s === "on";
      return next;
    });
  };

  // For limit: empty input → inherit; number → override.
  const limitVal = (k: string): string => k in limitOverride ? String(limitOverride[k]) : "";
  const setLimitVal = (k: string, v: string) => {
    setLimitOverride((prev) => {
      const next = { ...prev };
      if (v === "") delete next[k];
      else {
        const n = parseInt(v, 10);
        next[k] = Number.isNaN(n) ? 0 : n;
      }
      return next;
    });
  };

  const planEnt = plans.find((p) => p.id === planId)?.entitlements ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl max-h-[95vh] overflow-auto rounded-lg bg-white p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck size={18} /> Phân quyền — {user.email}
            </h2>
            <p className="text-xs text-slate-500">
              Effective hiện tại: <span className="font-mono">{effective?.plan_name ?? "—"}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <section className="border-b pb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {isSuper && (
            <div>
              <label className="text-sm font-medium">Domain</label>
              <select className="input" value={domainId} onChange={(e) => onDomainChange(e.target.value)}>
                <option value="">— Global (super_admin) —</option>
                {(domains ?? []).filter((d) => d.hostname !== "*").map((d) => (
                  <option key={d.id} value={d.id}>{d.hostname} — {d.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Đổi domain sẽ tự reset role (role không cross-domain).
              </p>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Role (per-domain)</label>
            <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={!domainId}>
              <option value="">— Inherit domain pages —</option>
              {(roles ?? []).filter((r) => r.status === "active").map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Khi có role: user chỉ thấy menu trong role (giao với domain). Inherit = full menu của domain.
            </p>
          </div>
        </section>

        <div>
          <label className="text-sm font-medium">Gói (Plan)</label>
          <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">— Dùng plan mặc định —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Plan quy định quyền cơ bản. Override bên dưới sẽ ưu tiên hơn plan.
          </p>
        </div>

        {!catalog ? (
          <p className="text-slate-500">Đang tải catalog...</p>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold mb-2">Features</h3>
              <p className="text-xs text-slate-500 mb-2">
                Mỗi feature có 3 trạng thái: <strong>Theo plan</strong> (kế thừa), <strong>Bật</strong>, <strong>Tắt</strong>.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {featureKeys.map((k) => {
                  const planValue = (planEnt?.features ?? {})[k] ?? false;
                  const eff = effective?.features?.[k] ?? false;
                  return (
                    <div key={k} className="flex items-center justify-between gap-2 border rounded px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{catalog.features[k]}</div>
                        <div className="text-xs text-slate-500 font-mono">{k}</div>
                        <div className="text-xs">
                          plan: <span className={planValue ? "text-emerald-600" : "text-rose-600"}>
                            {planValue ? "✓" : "✗"}
                          </span>
                          {" • "}
                          effective: <span className={eff ? "text-emerald-600" : "text-rose-600"}>
                            {eff ? "✓" : "✗"}
                          </span>
                        </div>
                      </div>
                      <select
                        className="input py-1 text-xs w-32"
                        value={featState(k)}
                        onChange={(e) => setFeatState(k, e.target.value as any)}
                      >
                        <option value="inherit">Theo plan</option>
                        <option value="on">Bật (force)</option>
                        <option value="off">Tắt (force)</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Limits</h3>
              <p className="text-xs text-slate-500 mb-2">
                Để trống = theo plan. Số = override (0 nghĩa là không giới hạn).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {limitKeys.map((k) => {
                  const planValue = (planEnt?.limits ?? {})[k] ?? 0;
                  const eff = effective?.limits?.[k] ?? 0;
                  return (
                    <div key={k} className="flex items-center justify-between gap-2 border rounded px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{catalog.limits[k]}</div>
                        <div className="text-xs text-slate-500 font-mono">{k}</div>
                        <div className="text-xs text-slate-500">
                          plan: <span className="font-mono">{planValue}</span>
                          {" • "}effective: <span className="font-mono">{eff}</span>
                        </div>
                      </div>
                      <input
                        type="number" min={0}
                        className="input py-1 w-24"
                        placeholder={`(${planValue})`}
                        value={limitVal(k)}
                        onChange={(e) => setLimitVal(k, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
            {save.isPending ? "Đang lưu..." : "Lưu quyền"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PLANS TAB
// ============================================================================

export function PlansTab() {
  const qc = useQueryClient();
  const { data: plans, isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => (await api.get<Plan[]>("/api/admin/plans")).data,
  });
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/plans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast("Đã xóa plan", "success");
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Plans / Gói</h2>
        <button onClick={() => setCreating(true)} className="btn-primary inline-flex items-center gap-1.5">
          <Plus size={16} />
          Tạo plan
        </button>
      </div>
      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Tên</th>
                <th className="px-4 py-2">Mặc định</th>
                <th className="px-4 py-2">Sort</th>
                <th className="px-4 py-2">Mô tả</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans?.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2 font-mono">{p.code}</td>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2">{p.is_default ? "✓" : ""}</td>
                  <td className="px-4 py-2">{p.sort_order}</td>
                  <td className="px-4 py-2 text-slate-600">{p.description || "—"}</td>
                  <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                    <button className="btn-ghost" onClick={() => setEditing(p)} title="Sửa plan">
                      <Pencil size={14} className="inline mr-1" />
                      Sửa
                    </button>
                    <button
                      className="btn-ghost text-rose-600"
                      onClick={() => confirm(`Xóa plan ${p.name}? Users đang dùng sẽ về plan mặc định.`) && remove.mutate(p.id)}
                      title="Xóa plan"
                    >
                      <Trash2 size={14} className="inline mr-1" />
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(editing || creating) && (
        <PlanEditorModal
          plan={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function PlanEditorModal({
  plan, isCreate, onClose,
}: { plan: Plan | null; isCreate: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: catalog } = useQuery({
    queryKey: ["admin-entitlement-catalog"],
    queryFn: async () => (await api.get<Catalog>("/api/admin/entitlements/catalog")).data,
  });

  const [code, setCode] = useState(plan?.code ?? "");
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [isDefault, setIsDefault] = useState(plan?.is_default ?? false);
  const [sortOrder, setSortOrder] = useState(plan?.sort_order ?? 0);
  const [features, setFeatures] = useState<Record<string, boolean>>(
    () => plan?.entitlements?.features ?? {},
  );
  const [limits, setLimits] = useState<Record<string, number>>(
    () => plan?.entitlements?.limits ?? {},
  );

  // Initialize all keys from catalog when it loads (so missing keys default to false/0).
  useEffect(() => {
    if (!catalog) return;
    setFeatures((prev) => {
      const next = { ...prev };
      Object.keys(catalog.features).forEach((k) => { if (!(k in next)) next[k] = false; });
      return next;
    });
    setLimits((prev) => {
      const next = { ...prev };
      Object.keys(catalog.limits).forEach((k) => { if (!(k in next)) next[k] = 0; });
      return next;
    });
  }, [catalog]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code, name,
        description: description || null,
        is_default: isDefault,
        sort_order: sortOrder,
        entitlements: { features, limits },
      };
      return isCreate
        ? api.post("/api/admin/plans", payload)
        : api.patch(`/api/admin/plans/${plan!.id}`, {
            name, description: description || null,
            is_default: isDefault, sort_order: sortOrder,
            entitlements: { features, limits },
          });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast(isCreate ? "Đã tạo plan" : "Đã cập nhật", "success");
      onClose();
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail?.message ?? "Lưu lỗi", "error");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-3xl max-h-[95vh] overflow-auto rounded-lg bg-white p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isCreate ? "Tạo plan mới" : `Sửa plan: ${plan?.name}`}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Code</label>
            <input
              className="input font-mono" value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!isCreate}
              placeholder="free, basic, pro..."
            />
          </div>
          <div>
            <label className="text-sm font-medium">Tên hiển thị</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Mô tả</label>
          <input className="input" value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Đặt làm plan mặc định cho user mới
          </label>
          <div>
            <label className="text-sm font-medium">Thứ tự (sort_order)</label>
            <input
              type="number" className="input"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value || "0", 10))}
            />
          </div>
        </div>

        {!catalog ? (
          <p className="text-slate-500">Đang tải catalog...</p>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-semibold mb-2">Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(catalog.features).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 border rounded px-3 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={features[k] ?? false}
                      onChange={(e) => setFeatures({ ...features, [k]: e.target.checked })}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{label}</div>
                      <div className="text-xs text-slate-500 font-mono">{k}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Limits</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Object.entries(catalog.limits).map(([k, label]) => (
                  <div key={k} className="flex items-center gap-2 border rounded px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{label}</div>
                      <div className="text-xs text-slate-500 font-mono">{k}</div>
                    </div>
                    <input
                      type="number" min={0}
                      className="input py-1 w-24"
                      value={limits[k] ?? 0}
                      onChange={(e) => setLimits({ ...limits, [k]: parseInt(e.target.value || "0", 10) })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
            {save.isPending ? "Đang lưu..." : isCreate ? "Tạo plan" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
