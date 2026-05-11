import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, AlertCircle, FileText, Download, X } from "lucide-react";
import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";

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

export function BillingPage() {
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

  if (isLoading) return <p className="text-slate-500">Đang tải...</p>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quản lý gói, hóa đơn và lịch sử thanh toán.
          </p>
        </div>
        <Link to="/pricing" className="btn-primary">
          Đổi gói / Nâng cấp
        </Link>
      </div>

      {/* Current subscription */}
      <CurrentSubscriptionCard
        sub={data?.current_subscription}
        onCancel={(id) => {
          if (confirm("Hủy subscription? Bạn vẫn dùng được tới hết chu kỳ hiện tại.")) {
            cancel.mutate(id);
          }
        }}
      />

      {/* Pending subscriptions */}
      {data?.pending_subscriptions && data.pending_subscriptions.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Clock size={16} className="text-amber-600" /> Đơn chờ xử lý
          </h2>
          <p className="text-sm text-slate-500">
            Đơn đã đặt nhưng chưa thanh toán. Hoàn tất chuyển khoản, admin sẽ kích hoạt trong 1h.
          </p>
          <div className="divide-y">
            {data.pending_subscriptions.map((s) => (
              <PendingRow key={s.id} sub={s} onCancel={cancel.mutate} />
            ))}
          </div>
        </section>
      )}

      {/* Invoices */}
      <section className="card space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <FileText size={16} /> Hóa đơn gần đây
        </h2>
        {data?.recent_invoices?.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có hóa đơn nào.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Mã HĐ</th>
                  <th className="px-3 py-2">Ngày</th>
                  <th className="px-3 py-2">Số tiền</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.recent_invoices?.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs">{i.invoice_number}</td>
                    <td className="px-3 py-2 text-slate-600">{formatDate(i.issued_at ?? i.created_at)}</td>
                    <td className="px-3 py-2 font-semibold">{formatVnd(i.total)}</td>
                    <td className="px-3 py-2"><StatusPill status={i.status} /></td>
                    <td className="px-3 py-2">
                      {i.pdf_url && (
                        <a href={i.pdf_url} className="text-brand-600 hover:underline text-xs inline-flex items-center gap-1">
                          <Download size={12} /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Payments */}
      <section className="card space-y-3">
        <h2 className="font-semibold">Lịch sử thanh toán</h2>
        {data?.recent_payments?.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có thanh toán nào.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2">Ngày</th>
                  <th className="px-3 py-2">Số tiền</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.recent_payments?.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-slate-600">{formatDate(p.paid_at ?? p.created_at)}</td>
                    <td className="px-3 py-2 font-semibold">{formatVnd(p.amount)}</td>
                    <td className="px-3 py-2 capitalize">{p.provider}</td>
                    <td className="px-3 py-2"><StatusPill status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CurrentSubscriptionCard({
  sub, onCancel,
}: { sub: Subscription | null | undefined; onCancel: (id: string) => void }) {
  if (!sub) {
    return (
      <section className="card">
        <h2 className="font-semibold mb-2 flex items-center gap-2">
          <AlertCircle size={16} className="text-slate-400" /> Chưa có subscription
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          Bạn đang dùng <strong>Free plan</strong>. Nâng cấp để mở khóa video, image-to-X, API public,
          quota cao hơn và nhiều hơn nữa.
        </p>
        <Link to="/pricing" className="btn-primary inline-block">Xem các gói</Link>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" /> Subscription hiện tại
          </h2>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-bold text-slate-900">{sub.plan_name}</span>
            <StatusPill status={sub.status} />
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {formatVnd(sub.amount)} / {sub.billing_cycle === "yearly" ? "năm" : "tháng"}
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

      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm border-t pt-3">
        <Field label="Bắt đầu chu kỳ" value={formatDate(sub.current_period_start)} />
        <Field label="Hết chu kỳ" value={formatDate(sub.current_period_end)} />
        <Field label="Provider" value={sub.provider} mono />
      </div>

      {sub.cancel_at_period_end && (
        <div className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          ⚠ Bạn đã yêu cầu hủy. Subscription kết thúc vào {formatDate(sub.current_period_end)} — sau đó về Free plan.
        </div>
      )}
    </section>
  );
}

function PendingRow({ sub, onCancel }: { sub: Subscription; onCancel: (id: string) => void }) {
  return (
    <div className="py-2 flex items-center justify-between flex-wrap gap-2">
      <div>
        <div className="font-medium">{sub.plan_name} · {sub.billing_cycle}</div>
        <div className="text-xs text-slate-500 font-mono">{sub.id.slice(0, 8)}</div>
      </div>
      <div className="text-right">
        <div className="font-semibold">{formatVnd(sub.amount)}</div>
        <div className="text-xs text-slate-500">{formatDate(sub.created_at)}</div>
      </div>
      <button
        onClick={() => {
          if (confirm("Hủy đơn pending này?")) onCancel(sub.id);
        }}
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
      <div className={`mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
