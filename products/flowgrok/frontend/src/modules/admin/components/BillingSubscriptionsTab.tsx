import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Trash2, Plus, Pencil } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AdminSubscription } from "../models/subscription";
import { subscriptionsService } from "../services/subscriptions.service";
import { formatVnd, formatDate as formatDateOnly } from "@/core/utils/format";
import { BillingSubscriptionEditorModal } from "./BillingSubscriptionEditorModal";

export function BillingSubscriptionsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<AdminSubscription | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: subs, isLoading } = useQuery({
    queryKey: ["admin-subscriptions", statusFilter],
    queryFn: () => subscriptionsService.list(statusFilter || undefined),
  });

  const confirmPay = useMutation({
    mutationFn: (id: string) => subscriptionsService.confirmPayment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      toast("Đã xác nhận thanh toán, sub kích hoạt", "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi xác nhận", "error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => subscriptionsService.remove(id),
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
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
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
                <tr key={s.id} className="border-t hover:bg-white">
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
        <BillingSubscriptionEditorModal
          sub={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
