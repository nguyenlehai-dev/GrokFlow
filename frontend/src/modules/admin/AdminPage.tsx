import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Navigate } from "react-router-dom";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
}

interface Stats {
  total_users: number;
  total_api_keys: number;
  total_profiles: number;
  total_jobs: number;
  jobs_24h_success: number;
  jobs_24h_failed: number;
}

export function AdminPage() {
  const me = useAuthStore((s) => s.user);
  if (me?.role !== "admin") return <Navigate to="/dashboard" replace />;

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get<Stats>("/api/admin/stats")).data,
  });
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await api.get<AdminUser[]>("/api/admin/users")).data,
  });

  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>

      {stats && (
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Users" value={stats.total_users} />
          <Stat label="API Keys" value={stats.total_api_keys} />
          <Stat label="Profiles" value={stats.total_profiles} />
          <Stat label="Tổng job" value={stats.total_jobs} />
          <Stat label="Job 24h success" value={stats.jobs_24h_success} accent="text-emerald-600" />
          <Stat label="Job 24h failed" value={stats.jobs_24h_failed} accent="text-rose-600" />
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <button onClick={() => setOpen(true)} className="btn-primary">+ Tạo user</button>
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
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => <UserRow key={u.id} u={u} meId={me!.id} />)}
            </tbody>
          </table>
        </div>
      )}

      {open && <CreateUserModal onClose={() => setOpen(false)} />}
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

function UserRow({ u, meId }: { u: AdminUser; meId: string }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (patch: Partial<AdminUser>) => api.patch(`/api/admin/users/${u.id}`, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast("Đã cập nhật", "success"); },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/admin/users/${u.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast("Đã xóa user", "success"); },
  });
  return (
    <tr className="border-t">
      <td className="px-4 py-2 font-medium">{u.email}</td>
      <td className="px-4 py-2">{u.full_name || "—"}</td>
      <td className="px-4 py-2">
        <select className="input py-1" defaultValue={u.role} onChange={(e) => update.mutate({ role: e.target.value })}>
          <option value="user">user</option>
          <option value="admin">admin</option>
          <option value="support">support</option>
        </select>
      </td>
      <td className="px-4 py-2"><StatusBadge status={u.status} /></td>
      <td className="px-4 py-2 text-slate-500">{new Date(u.created_at).toLocaleString()}</td>
      <td className="px-4 py-2 space-x-2">
        {u.status === "active" ? (
          <button className="btn-ghost" onClick={() => update.mutate({ status: "banned" })}>Ban</button>
        ) : (
          <button className="btn-ghost" onClick={() => update.mutate({ status: "active" })}>Activate</button>
        )}
        {u.id !== meId && (
          <button className="btn-ghost text-rose-600" onClick={() => confirm(`Xóa user ${u.email}?`) && remove.mutate()}>
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

interface CreateValues {
  email: string;
  password: string;
  full_name: string;
  role: "admin" | "user" | "support";
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<CreateValues>({
    defaultValues: { role: "user" },
  });
  const onSubmit = async (v: CreateValues) => {
    await api.post("/api/admin/users", v);
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
        <div>
          <label className="text-sm font-medium">Role</label>
          <select className="input" {...register("role")}>
            <option value="user">user</option>
            <option value="admin">admin</option>
            <option value="support">support</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>Tạo</button>
        </div>
      </form>
    </div>
  );
}
