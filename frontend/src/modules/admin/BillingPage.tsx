import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, Clock, AlertCircle, FileText, Download, X,
  Wallet, Crown, ChevronRight, ChevronDown,
} from "lucide-react";

import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import { useAuthStore } from "@/core/auth/store";
import { AdminBillingTab } from "./AdminBillingTab";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Subscription {
  id: string;
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

interface Payment {
  id: string;
  subscription_id: string | null;
  amount: number | string;
  currency: string;
  status: string;
  provider: string;
  payment_method: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
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

interface Summary {
  current_subscription: Subscription | null;
  pending_subscriptions: Subscription[];
  recent_payments: Payment[];
  recent_invoices: Invoice[];
}

// ─── Utils ─────────────────────────────────────────────────────────────────

const formatVnd = (n: number | string) =>
  new Intl.NumberFormat("vi-VN").format(Number(n)) + "₫";

const formatDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("vi-VN") : "—";

const STATUS_STYLE: Record<string, string> = {
  active:    "bg-emerald-100 text-emerald-700",
  pending:   "bg-amber-100 text-amber-700",
  success:   "bg-emerald-100 text-emerald-700",
  paid:      "bg-emerald-100 text-emerald-700",
  draft:     "bg-slate-100 text-slate-700",
  cancelled: "bg-slate-100 text-slate-700",
  expired:   "bg-slate-100 text-slate-700",
  failed:    "bg-rose-100 text-rose-700",
  past_due:  "bg-rose-100 text-rose-700",
  refunded:  "bg-purple-100 text-purple-700",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export function BillingPage() {
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";
  const isAdmin = me?.role === "admin" || isSuper;

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["billing-summary"],
    queryFn: async () => (await api.get<Summary>("/api/billing/me")).data,
  });

  const cancel = useMutation({
    mutationFn: (subId: string) => api.post(`/api/billing/subscriptions/${subId}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-summary"] });
      toast("Đã hủy subscription", "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Hủy lỗi", "error"),
  });

  // Section collapse state — admin sees system block expanded by default,
  // personal-billing section collapsed (less interesting for super_admin).
  const [openSystem, setOpenSystem] = useState(isSuper);
  const [openPersonal, setOpenPersonal] = useState(!isSuper);

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="rounded-xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 text-white p-6 shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80 font-semibold">
              Billing {isSuper && "· Quản trị hệ thống"}
            </p>
            <h1 className="text-2xl font-bold mt-0.5 flex items-center gap-2">
              <Wallet size={22} />
              {isSuper ? "Quản lý billing toàn hệ thống" : "Billing & gói dịch vụ"}
            </h1>
            <p className="text-sm opacity-90 mt-1">
              {isSuper
                ? "Subscriptions, payments, invoices của mọi tenant + gói cá nhân của bạn."
                : "Gói hiện tại, hóa đơn và lịch sử thanh toán."}
            </p>
          </div>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-1.5 rounded-md bg-white/15 hover:bg-white/25 backdrop-blur-sm px-4 py-2 text-sm font-medium border border-white/30"
          >
            <Crown size={14} /> Đổi gói / Nâng cấp
          </Link>
        </div>
      </div>

      {/* SYSTEM-WIDE BILLING — admin / super_admin only */}
      {isAdmin && (
        <section className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <button
            onClick={() => setOpenSystem(!openSystem)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition border-b border-slate-200"
          >
            <div className="flex items-center gap-2 text-left">
              <Crown size={16} className="text-amber-600" />
              <div>
                <h2 className="font-semibold text-slate-800">
                  {isSuper ? "Toàn bộ subscriptions / payments / invoices" : "Billing trong domain"}
                </h2>
                <p className="text-xs text-slate-500">
                  3 tab: Subscriptions · Payments · Invoices — CRUD đầy đủ
                </p>
              </div>
            </div>
            {openSystem ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          {openSystem && (
            <div className="p-5 bg-slate-50/30">
              <AdminBillingTab />
            </div>
          )}
        </section>
      )}

      {/* PERSONAL BILLING — everyone */}
      <section className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
        <button
          onClick={() => setOpenPersonal(!openPersonal)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition border-b border-slate-200"
        >
          <div className="flex items-center gap-2 text-left">
            <Wallet size={16} className="text-emerald-600" />
            <div>
              <h2 className="font-semibold text-slate-800">Gói của bạn</h2>
              <p className="text-xs text-slate-500">
                Subscription cá nhân, hóa đơn + thanh toán của tài khoản{" "}
                <code className="font-mono">{me?.email}</code>
              </p>
            </div>
          </div>
          {openPersonal ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {openPersonal && (
          <div className="p-5 space-y-5">
            {isLoading ? (
              <p className="text-slate-500 text-sm">Đang tải...</p>
            ) : (
              <PersonalBillingBody
                data={data}
                onCancel={(id) => {
                  if (confirm("Hủy subscription? Bạn vẫn dùng được tới hết chu kỳ hiện tại.")) {
                    cancel.mutate(id);
                  }
                }}
                onCancelPending={(id) => {
                  if (confirm("Hủy đơn pending này?")) cancel.mutate(id);
                }}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Personal billing body (extracted from old page) ───────────────────────

function PersonalBillingBody({
  data, onCancel, onCancelPending,
}: {
  data: Summary | undefined;
  onCancel: (id: string) => void;
  onCancelPending: (id: string) => void;
}) {
  return (
    <>
      <CurrentSubscriptionCard sub={data?.current_subscription} onCancel={onCancel} />

      {data?.pending_subscriptions && data.pending_subscriptions.length > 0 && (
        <section className="rounded-md ring-1 ring-amber-200 bg-amber-50/50 p-4 space-y-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Clock size={16} className="text-amber-600" /> Đơn chờ xử lý
          </h3>
          <p className="text-xs text-slate-600">
            Đơn đã đặt nhưng chưa thanh toán. Hoàn tất chuyển khoản, admin sẽ kích hoạt trong 1h.
          </p>
          <div className="divide-y divide-amber-200">
            {data.pending_subscriptions.map((s) => (
              <PendingRow key={s.id} sub={s} onCancel={onCancelPending} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <DataCard title="Hóa đơn gần đây" icon={FileText}>
          {data?.recent_invoices?.length === 0 ? (
            <p className="text-sm text-slate-500 italic px-3 py-6 text-center">
              Chưa có hóa đơn nào.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600 text-xs">
                <tr>
                  <th className="px-3 py-2">Mã HĐ</th>
                  <th className="px-3 py-2">Ngày</th>
                  <th className="px-3 py-2">Số tiền</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.recent_invoices?.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs">{i.invoice_number}</td>
                    <td className="px-3 py-2 text-slate-600 text-xs">{formatDate(i.issued_at ?? i.created_at)}</td>
                    <td className="px-3 py-2 font-semibold">{formatVnd(i.total)}</td>
                    <td className="px-3 py-2"><StatusPill status={i.status} /></td>
                    <td className="px-3 py-2">
                      {i.pdf_url && (
                        <a href={i.pdf_url} className="text-violet-600 hover:underline text-xs inline-flex items-center gap-1">
                          <Download size={12} /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataCard>

        <DataCard title="Lịch sử thanh toán" icon={Wallet}>
          {data?.recent_payments?.length === 0 ? (
            <p className="text-sm text-slate-500 italic px-3 py-6 text-center">
              Chưa có thanh toán nào.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600 text-xs">
                <tr>
                  <th className="px-3 py-2">Ngày</th>
                  <th className="px-3 py-2">Số tiền</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.recent_payments?.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600 text-xs">{formatDate(p.paid_at ?? p.created_at)}</td>
                    <td className="px-3 py-2 font-semibold">{formatVnd(p.amount)}</td>
                    <td className="px-3 py-2 capitalize text-xs">{p.provider}</td>
                    <td className="px-3 py-2"><StatusPill status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataCard>
      </div>
    </>
  );
}

function DataCard({
  title, icon: Icon, children,
}: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-lg ring-1 ring-slate-200 bg-white overflow-hidden">
      <h3 className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 font-semibold text-slate-800 text-sm flex items-center gap-2">
        <Icon size={14} /> {title}
      </h3>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function CurrentSubscriptionCard({
  sub, onCancel,
}: { sub: Subscription | null | undefined; onCancel: (id: string) => void }) {
  if (!sub) {
    return (
      <div className="rounded-lg ring-1 ring-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <h3 className="font-semibold mb-2 flex items-center gap-2 text-slate-800">
          <AlertCircle size={16} className="text-slate-400" /> Chưa có subscription
        </h3>
        <p className="text-sm text-slate-600 mb-3">
          Bạn đang dùng <strong>Free plan</strong>. Nâng cấp để mở khóa video, image-to-X, API public,
          quota cao hơn và nhiều hơn nữa.
        </p>
        <Link to="/pricing" className="btn-primary inline-block">Xem các gói</Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg ring-1 ring-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2 text-slate-800">
            <CheckCircle2 size={16} className="text-emerald-600" /> Subscription hiện tại
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-bold text-slate-900">{sub.plan_name}</span>
            <StatusPill status={sub.status} />
          </div>
          <p className="text-sm text-slate-600 mt-1">
            <strong className="text-emerald-700">{formatVnd(sub.amount)}</strong>{" "}
            / {sub.billing_cycle === "yearly" ? "năm" : "tháng"}
          </p>
        </div>
        {!sub.cancel_at_period_end && (
          <button
            onClick={() => onCancel(sub.id)}
            className="btn-ghost text-rose-600 text-sm"
            title="Hủy subscription"
          >
            <X size={14} className="inline mr-1" /> Hủy
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm border-t border-emerald-200 pt-3">
        <Field label="Bắt đầu chu kỳ" value={formatDate(sub.current_period_start)} />
        <Field label="Hết chu kỳ" value={formatDate(sub.current_period_end)} />
        <Field label="Provider" value={sub.provider} mono />
      </div>

      {sub.cancel_at_period_end && (
        <div className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          ⚠ Bạn đã yêu cầu hủy. Subscription kết thúc vào {formatDate(sub.current_period_end)} — sau đó về Free plan.
        </div>
      )}
    </div>
  );
}

function PendingRow({ sub, onCancel }: { sub: Subscription; onCancel: (id: string) => void }) {
  return (
    <div className="py-2 flex items-center justify-between flex-wrap gap-2">
      <div>
        <div className="font-medium text-sm">{sub.plan_name} · {sub.billing_cycle}</div>
        <div className="text-xs text-slate-500 font-mono">{sub.id.slice(0, 8)}</div>
      </div>
      <div className="text-right">
        <div className="font-semibold">{formatVnd(sub.amount)}</div>
        <div className="text-xs text-slate-500">{formatDate(sub.created_at)}</div>
      </div>
      <button
        onClick={() => onCancel(sub.id)}
        className="btn-ghost text-rose-600 text-xs"
      >
        Hủy đơn
      </button>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
