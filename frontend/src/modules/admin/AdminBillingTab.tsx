import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Trash2, Plus, Pencil, FileText, CreditCard, Receipt } from "lucide-react";
import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";

type SubTab = "subscriptions" | "payments" | "invoices";

interface AdminSubscription {
  id: string;
  user_id: string;
  user_email: string;
  plan_id: string;
  plan_code: string;
  plan_name: string;
  status: string;
  billing_cycle: string;
  provider: string;
  amount: number | string;
  currency: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  created_at: string;
}

interface AdminPayment {
  id: string;
  user_id: string;
  user_email: string;
  subscription_id: string | null;
  amount: number | string;
  currency: string;
  status: string;
  provider: string;
  provider_payment_id: string | null;
  payment_method: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

interface AdminInvoice {
  id: string;
  user_id: string;
  user_email: string;
  subscription_id: string | null;
  payment_id: string | null;
  invoice_number: string;
  amount: number | string;
  tax: number | string;
  total: number | string;
  currency: string;
  status: string;
  issued_at: string | null;
  paid_at: string | null;
  line_items: any[];
  billing_info: any;
  pdf_url: string | null;
  created_at: string;
}

const formatVnd = (n: number | string) =>
  new Intl.NumberFormat("vi-VN").format(Number(n)) + "₫";

const formatDate = (s: string | null) =>
  s ? new Date(s).toLocaleString("vi-VN") : "—";

const formatDateOnly = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("vi-VN") : "—";

export function AdminBillingTab() {
  const [sub, setSub] = useState<SubTab>("subscriptions");
  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b">
        <SubTabBtn active={sub === "subscriptions"} onClick={() => setSub("subscriptions")} icon={CreditCard}>
          Subscriptions
        </SubTabBtn>
        <SubTabBtn active={sub === "payments"} onClick={() => setSub("payments")} icon={Receipt}>
          Payments
        </SubTabBtn>
        <SubTabBtn active={sub === "invoices"} onClick={() => setSub("invoices")} icon={FileText}>
          Invoices
        </SubTabBtn>
      </div>
      {sub === "subscriptions" && <SubscriptionsPanel />}
      {sub === "payments" && <PaymentsPanel />}
      {sub === "invoices" && <InvoicesPanel />}
    </div>
  );
}

function SubTabBtn({
  active, onClick, children, icon: Icon,
}: { active: boolean; onClick: () => void; children: React.ReactNode; icon: any }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 transition ${
        active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      <Icon size={14} />
      {children}
    </button>
  );
}

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================

function SubscriptionsPanel() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<AdminSubscription | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: subs, isLoading } = useQuery({
    queryKey: ["admin-subscriptions", statusFilter],
    queryFn: async () => {
      const q = statusFilter ? `?status_filter=${statusFilter}` : "";
      return (await api.get<AdminSubscription[]>(`/api/admin/subscriptions${q}`)).data;
    },
  });

  const confirmPay = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/subscriptions/${id}/confirm-payment`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      toast("Đã xác nhận thanh toán, sub kích hoạt", "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi xác nhận", "error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/subscriptions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      toast("Đã xóa", "success");
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            className="input w-auto py-1.5"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tất cả status</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
            <option value="past_due">Past due</option>
          </select>
          <span className="text-xs text-slate-500">{subs?.length ?? 0} records</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> Tạo subscription
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Cycle</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subs?.map((s) => (
                <tr key={s.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.user_email}</div>
                    <div className="text-xs text-slate-500 font-mono">{s.user_id.slice(0, 8)}</div>
                  </td>
                  <td className="px-3 py-2 font-medium">{s.plan_name}</td>
                  <td className="px-3 py-2">{s.billing_cycle}</td>
                  <td className="px-3 py-2 font-semibold">{formatVnd(s.amount)}</td>
                  <td className="px-3 py-2 capitalize">{s.provider}</td>
                  <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                    {formatDateOnly(s.current_period_start)} → {formatDateOnly(s.current_period_end)}
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    {s.status === "pending" && (
                      <button
                        className="btn-ghost text-emerald-600"
                        onClick={() => {
                          if (confirm(`Xác nhận thanh toán cho ${s.user_email} - ${formatVnd(s.amount)}?`)) {
                            confirmPay.mutate(s.id);
                          }
                        }}
                        title="Xác nhận đã nhận tiền"
                      >
                        <CheckCircle2 size={14} className="inline mr-1" />
                        Xác nhận
                      </button>
                    )}
                    <button className="btn-ghost" onClick={() => setEditing(s)} title="Sửa">
                      <Pencil size={14} className="inline mr-1" />
                      Sửa
                    </button>
                    <button
                      className="btn-ghost text-rose-600"
                      onClick={() => confirm(`Xóa subscription của ${s.user_email}?`) && remove.mutate(s.id)}
                      title="Xóa"
                    >
                      <Trash2 size={14} className="inline mr-1" />
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
              {(subs ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Không có subscription nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <SubscriptionEditorModal
          sub={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function SubscriptionEditorModal({
  sub, isCreate, onClose,
}: { sub: AdminSubscription | null; isCreate: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState(sub?.user_id ?? "");
  const [planId, setPlanId] = useState(sub?.plan_id ?? "");
  const [status, setStatus] = useState(sub?.status ?? "active");
  const [billingCycle, setBillingCycle] = useState(sub?.billing_cycle ?? "monthly");
  const [provider, setProvider] = useState(sub?.provider ?? "manual");
  const [amount, setAmount] = useState(String(sub?.amount ?? 0));
  const [start, setStart] = useState(sub?.current_period_start?.slice(0, 16) ?? "");
  const [end, setEnd] = useState(sub?.current_period_end?.slice(0, 16) ?? "");

  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await api.get<any[]>("/api/admin/users")).data,
  });
  const { data: plans } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => (await api.get<any[]>("/api/admin/plans")).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        plan_id: planId, status, billing_cycle: billingCycle, provider,
        amount: Number(amount),
        current_period_start: start ? new Date(start).toISOString() : null,
        current_period_end: end ? new Date(end).toISOString() : null,
      };
      if (isCreate) payload.user_id = userId;
      return isCreate
        ? api.post("/api/admin/subscriptions", payload)
        : api.patch(`/api/admin/subscriptions/${sub!.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi lưu", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">
          {isCreate ? "Tạo subscription" : `Sửa subscription`}
        </h2>
        {isCreate && (
          <div>
            <label className="text-sm font-medium">User</label>
            <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">— chọn —</option>
              {users?.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-sm font-medium">Plan</label>
          <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">— chọn —</option>
            {plans?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">pending</option>
              <option value="active">active</option>
              <option value="past_due">past_due</option>
              <option value="cancelled">cancelled</option>
              <option value="expired">expired</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Cycle</label>
            <select className="input" value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)}>
              <option value="monthly">monthly</option>
              <option value="yearly">yearly</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Provider</label>
            <input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Amount (VND)</label>
            <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Period start</label>
            <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Period end</label>
            <input className="input" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || (isCreate && !userId) || !planId}
            className="btn-primary"
          >
            {save.isPending ? "Đang lưu..." : isCreate ? "Tạo" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PAYMENTS
// ============================================================================

function PaymentsPanel() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<AdminPayment | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: payments, isLoading } = useQuery({
    queryKey: ["admin-payments", statusFilter],
    queryFn: async () => {
      const q = statusFilter ? `?status_filter=${statusFilter}` : "";
      return (await api.get<AdminPayment[]>(`/api/admin/payments${q}`)).data;
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/payments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
      toast("Đã xóa payment", "success");
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            className="input w-auto py-1.5"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tất cả status</option>
            <option value="pending">Pending</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
          <span className="text-xs text-slate-500">{payments?.length ?? 0} records</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> Tạo payment
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Ngày</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Provider ID</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments?.map((p) => (
                <tr key={p.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(p.paid_at ?? p.created_at)}
                  </td>
                  <td className="px-3 py-2">{p.user_email}</td>
                  <td className="px-3 py-2 font-semibold">{formatVnd(p.amount)}</td>
                  <td className="px-3 py-2 capitalize">{p.provider}</td>
                  <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                  <td className="px-3 py-2 font-mono text-xs">{p.provider_payment_id ?? "—"}</td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button className="btn-ghost" onClick={() => setEditing(p)}>
                      <Pencil size={14} className="inline mr-1" /> Sửa
                    </button>
                    <button
                      className="btn-ghost text-rose-600"
                      onClick={() => confirm("Xóa payment?") && remove.mutate(p.id)}
                    >
                      <Trash2 size={14} className="inline mr-1" /> Xóa
                    </button>
                  </td>
                </tr>
              ))}
              {(payments ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Không có payment nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <PaymentEditorModal
          pay={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function PaymentEditorModal({
  pay, isCreate, onClose,
}: { pay: AdminPayment | null; isCreate: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState(pay?.user_id ?? "");
  const [subId, setSubId] = useState(pay?.subscription_id ?? "");
  const [amount, setAmount] = useState(String(pay?.amount ?? ""));
  const [status, setStatus] = useState(pay?.status ?? "success");
  const [provider, setProvider] = useState(pay?.provider ?? "manual");
  const [providerPaymentId, setProviderPaymentId] = useState(pay?.provider_payment_id ?? "");
  const [paymentMethod, setPaymentMethod] = useState(pay?.payment_method ?? "");
  const [paidAt, setPaidAt] = useState(pay?.paid_at?.slice(0, 16) ?? "");
  const [reason, setReason] = useState(pay?.failure_reason ?? "");

  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await api.get<any[]>("/api/admin/users")).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        amount: Number(amount), status, provider,
        provider_payment_id: providerPaymentId || null,
        payment_method: paymentMethod || null,
        paid_at: paidAt ? new Date(paidAt).toISOString() : null,
        failure_reason: reason || null,
      };
      if (isCreate) {
        payload.user_id = userId;
        if (subId) payload.subscription_id = subId;
      }
      return isCreate
        ? api.post("/api/admin/payments", payload)
        : api.patch(`/api/admin/payments/${pay!.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">{isCreate ? "Tạo payment" : "Sửa payment"}</h2>
        {isCreate && (
          <>
            <div>
              <label className="text-sm font-medium">User</label>
              <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">— chọn —</option>
                {users?.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Subscription ID (tùy chọn)</label>
              <input className="input font-mono" value={subId} onChange={(e) => setSubId(e.target.value)}
                placeholder="UUID hoặc để trống cho payment lẻ" />
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Amount (VND)</label>
            <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">pending</option>
              <option value="success">success</option>
              <option value="failed">failed</option>
              <option value="refunded">refunded</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Provider</label>
            <input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Payment method</label>
            <input className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="cash, momo_wallet, ..." />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">Provider payment ID</label>
            <input className="input font-mono" value={providerPaymentId}
              onChange={(e) => setProviderPaymentId(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">Paid at</label>
            <input className="input" type="datetime-local" value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          {status === "failed" && (
            <div className="col-span-2">
              <label className="text-sm font-medium">Failure reason</label>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-primary">
            {save.isPending ? "Đang lưu..." : isCreate ? "Tạo" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// INVOICES
// ============================================================================

function InvoicesPanel() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<AdminInvoice | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["admin-invoices", statusFilter],
    queryFn: async () => {
      const q = statusFilter ? `?status_filter=${statusFilter}` : "";
      return (await api.get<AdminInvoice[]>(`/api/admin/invoices${q}`)).data;
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/invoices/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      toast("Đã xóa invoice", "success");
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            className="input w-auto py-1.5"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tất cả status</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
          <span className="text-xs text-slate-500">{invoices?.length ?? 0} records</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> Tạo invoice
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500">Đang tải...</p>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Số HĐ</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Tax</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Issued</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices?.map((i) => (
                <tr key={i.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{i.invoice_number}</td>
                  <td className="px-3 py-2">{i.user_email}</td>
                  <td className="px-3 py-2">{formatVnd(i.amount)}</td>
                  <td className="px-3 py-2 text-slate-500">{formatVnd(i.tax)}</td>
                  <td className="px-3 py-2 font-semibold">{formatVnd(i.total)}</td>
                  <td className="px-3 py-2"><StatusBadge status={i.status} /></td>
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                    {formatDateOnly(i.issued_at)}
                  </td>
                  <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                    <button className="btn-ghost" onClick={() => setEditing(i)}>
                      <Pencil size={14} className="inline mr-1" /> Sửa
                    </button>
                    <button
                      className="btn-ghost text-rose-600"
                      onClick={() => confirm(`Xóa invoice ${i.invoice_number}?`) && remove.mutate(i.id)}
                    >
                      <Trash2 size={14} className="inline mr-1" /> Xóa
                    </button>
                  </td>
                </tr>
              ))}
              {(invoices ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Không có invoice nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(editing || creating) && (
        <InvoiceEditorModal
          inv={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}

function InvoiceEditorModal({
  inv, isCreate, onClose,
}: { inv: AdminInvoice | null; isCreate: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState(inv?.user_id ?? "");
  const [amount, setAmount] = useState(String(inv?.amount ?? ""));
  const [tax, setTax] = useState(String(inv?.tax ?? 0));
  const [status, setStatus] = useState(inv?.status ?? "issued");
  const [pdfUrl, setPdfUrl] = useState(inv?.pdf_url ?? "");
  const [description, setDescription] = useState(
    inv?.line_items?.[0]?.description ?? "",
  );

  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await api.get<any[]>("/api/admin/users")).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      const lineItems = description
        ? [{ description, quantity: 1, amount: Number(amount) }]
        : (inv?.line_items ?? []);
      const payload: any = {
        amount: Number(amount), tax: Number(tax), status,
        line_items: lineItems,
        pdf_url: pdfUrl || null,
      };
      if (isCreate) payload.user_id = userId;
      return isCreate
        ? api.post("/api/admin/invoices", payload)
        : api.patch(`/api/admin/invoices/${inv!.id}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg space-y-3">
        <h2 className="text-lg font-semibold">{isCreate ? "Tạo invoice" : `Sửa ${inv?.invoice_number}`}</h2>
        {isCreate && (
          <div>
            <label className="text-sm font-medium">User</label>
            <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">— chọn —</option>
              {users?.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-sm font-medium">Mô tả dịch vụ</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="VD: Gói Pro (monthly) tháng 11/2026" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium">Amount</label>
            <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Tax</label>
            <input className="input" type="number" value={tax} onChange={(e) => setTax(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">draft</option>
              <option value="issued">issued</option>
              <option value="paid">paid</option>
              <option value="void">void</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">PDF URL (tùy chọn)</label>
          <input className="input" value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost">Hủy</button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || (isCreate && !userId) || !amount}
            className="btn-primary"
          >
            {save.isPending ? "Đang lưu..." : isCreate ? "Tạo" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
