import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Pause, Search, Loader2, X, Mail, KeyRound, User as UserIcon,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { api } from "@/core/api/axios";
import { toolAdminService } from "../services/tool.service";
import type {
  ToolCustomer, ToolCustomerCreate, ToolCustomerUpdate,
} from "../models/types";

interface PlanRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

/** "Khách hàng Tool" — focused user-provisioning surface for the desktop
 *  Tool product. Wraps the existing User + Plan system with a UX targeted
 *  at the SaaS sales flow: super_admin gets an email + password from the
 *  customer, creates the account here, picks their plan, sends them the
 *  installer + credentials. Suspend = soft-delete (set status=inactive)
 *  so existing chat history / prompts survive for support escalation. */
export function ToolAdminCustomersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ToolCustomer | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-tool-customers", q, statusFilter],
    queryFn: () => toolAdminService.listCustomers({
      q: q.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
    }),
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["admin-plans-light"],
    queryFn: () => api.get<PlanRow[]>("/api/admin/plans").then((r) => r.data),
  });

  const suspendMut = useMutation({
    mutationFn: (id: string) => toolAdminService.suspendCustomer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tool-customers"] });
      toast("Đã tạm khoá tài khoản", "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  const reactivateMut = useMutation({
    mutationFn: (id: string) => toolAdminService.updateCustomer(id, { status: "active" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tool-customers"] });
      toast("Đã kích hoạt lại", "success");
    },
  });

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Khách hàng Tool</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Quản lý các tài khoản end-user dùng GrokFlow Desktop. Tạo account,
            gán plan, theo dõi usage cá nhân (chat sessions + prompts).
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm"
        >
          <Plus size={14} /> Tạo khách mới
        </button>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm email / tên..."
            className="flex-1 px-2 py-1 text-sm bg-transparent focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          className="px-2 py-1 text-sm border border-slate-200 rounded-md bg-white"
        >
          <option value="all">Mọi trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Đã khoá</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-slate-400">
            <Loader2 size={20} className="animate-spin mx-auto" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            Chưa có khách hàng nào. Bấm "Tạo khách mới" để bắt đầu.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase tracking-wider bg-slate-50">
              <tr>
                <th className="text-left font-medium px-3 py-2">Email</th>
                <th className="text-left font-medium px-3 py-2">Tên</th>
                <th className="text-left font-medium px-3 py-2">Plan</th>
                <th className="text-left font-medium px-3 py-2">Trạng thái</th>
                <th className="text-right font-medium px-3 py-2">Chats</th>
                <th className="text-right font-medium px-3 py-2">Prompts</th>
                <th className="text-right font-medium px-3 py-2">Tạo lúc</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {data!.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-800 max-w-[260px] truncate" title={c.email}>
                    {c.email}
                  </td>
                  <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate">
                    {c.full_name ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {c.plan_name ? (
                      <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 ring-1 ring-violet-200">
                        {c.plan_name}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">Default</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600 font-mono">{c.chat_session_count}</td>
                  <td className="px-3 py-2 text-right text-slate-600 font-mono">{c.prompt_count}</td>
                  <td className="px-3 py-2 text-right text-slate-500 text-xs">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setEditing(c)}
                      className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"
                      title="Sửa"
                    >
                      <Pencil size={14} />
                    </button>
                    {c.status === "active" ? (
                      <button
                        onClick={() => {
                          if (window.confirm(`Tạm khoá ${c.email}?`)) suspendMut.mutate(c.id);
                        }}
                        className="p-1.5 text-amber-500 hover:bg-amber-50 rounded"
                        title="Tạm khoá"
                      >
                        <Pause size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => reactivateMut.mutate(c.id)}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                        title="Kích hoạt lại"
                      >
                        ▶
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <CustomerCreateModal
          plans={plans}
          onClose={() => setCreating(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["admin-tool-customers"] });
            setCreating(false);
          }}
        />
      )}

      {editing && (
        <CustomerEditModal
          customer={editing}
          plans={plans}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-tool-customers"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 bg-emerald-100 text-emerald-700 ring-emerald-200">
        ● active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 bg-slate-100 text-slate-500 ring-slate-200">
      ○ inactive
    </span>
  );
}

function CustomerCreateModal({
  plans, onClose, onCreated,
}: {
  plans: PlanRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<ToolCustomerCreate>({
    email: "",
    password: "",
    full_name: "",
    plan_id: null,
  });

  const saveMut = useMutation({
    mutationFn: () => toolAdminService.createCustomer({
      ...form,
      full_name: form.full_name?.trim() || null,
      plan_id: form.plan_id || null,
    }),
    onSuccess: () => {
      toast(`Tạo ${form.email} OK. Gửi installer + password cho khách.`, "success");
      onCreated();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  const canSubmit = form.email.includes("@") && form.password.length >= 8;

  return (
    <ModalShell title="Tạo khách hàng mới" onClose={onClose}>
      <FormField label="Email" icon={Mail}>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value.trim() })}
          placeholder="khach@example.com"
          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
        />
      </FormField>
      <FormField label="Họ tên (optional)" icon={UserIcon}>
        <input
          value={form.full_name ?? ""}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          placeholder="Nguyen Van A"
          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
        />
      </FormField>
      <FormField label="Password (≥ 8 ký tự)" icon={KeyRound}>
        <input
          type="text"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="MatKhau123"
          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 font-mono"
        />
      </FormField>
      <FormField label="Plan">
        <select
          value={form.plan_id ?? ""}
          onChange={(e) => setForm({ ...form, plan_id: e.target.value || null })}
          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
        >
          <option value="">— Default plan —</option>
          {plans.filter((p) => p.is_active).map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
          ))}
        </select>
      </FormField>
      <ModalFooter
        onCancel={onClose}
        onSubmit={() => saveMut.mutate()}
        submitting={saveMut.isPending}
        submitLabel="Tạo khách"
        canSubmit={canSubmit}
      />
    </ModalShell>
  );
}

function CustomerEditModal({
  customer, plans, onClose, onSaved,
}: {
  customer: ToolCustomer;
  plans: PlanRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ToolCustomerUpdate>({
    full_name: customer.full_name,
    plan_id: customer.plan_id,
    status: customer.status as "active" | "inactive",
  });
  const [newPassword, setNewPassword] = useState("");

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: ToolCustomerUpdate = { ...form };
      if (newPassword.trim()) payload.password = newPassword.trim();
      return toolAdminService.updateCustomer(customer.id, payload);
    },
    onSuccess: () => {
      toast("Đã lưu", "success");
      onSaved();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  return (
    <ModalShell title={`Sửa: ${customer.email}`} onClose={onClose}>
      <FormField label="Họ tên" icon={UserIcon}>
        <input
          value={form.full_name ?? ""}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
        />
      </FormField>
      <FormField label="Plan">
        <select
          value={form.plan_id ?? ""}
          onChange={(e) => setForm({ ...form, plan_id: e.target.value || null })}
          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
        >
          <option value="">— Default plan —</option>
          {plans.filter((p) => p.is_active).map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
          ))}
        </select>
      </FormField>
      <FormField label="Trạng thái">
        <select
          value={form.status ?? "active"}
          onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })}
          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
        >
          <option value="active">Active (cho phép đăng nhập)</option>
          <option value="inactive">Inactive (tạm khoá)</option>
        </select>
      </FormField>
      <FormField label="Đổi password (để trống = giữ nguyên)" icon={KeyRound}>
        <input
          type="text"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="≥ 8 ký tự"
          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 font-mono"
        />
      </FormField>
      <ModalFooter
        onCancel={onClose}
        onSubmit={() => saveMut.mutate()}
        submitting={saveMut.isPending}
        submitLabel="Lưu"
        canSubmit={!newPassword || newPassword.length >= 8}
      />
    </ModalShell>
  );
}

function ModalShell({
  title, children, onClose,
}: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
        <header className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded">
            <X size={16} />
          </button>
        </header>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

function FormField({
  label, icon: Icon, children,
}: { label: string; icon?: any; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600 mb-1 inline-flex items-center gap-1">
        {Icon && <Icon size={12} className="text-slate-400" />} {label}
      </label>
      {children}
    </div>
  );
}

function ModalFooter({
  onCancel, onSubmit, submitting, submitLabel, canSubmit,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
  canSubmit: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
      <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-md">
        Hủy
      </button>
      <button
        onClick={onSubmit}
        disabled={!canSubmit || submitting}
        className="px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-md"
      >
        {submitting ? "Đang lưu..." : submitLabel}
      </button>
    </div>
  );
}

export default ToolAdminCustomersPage;
