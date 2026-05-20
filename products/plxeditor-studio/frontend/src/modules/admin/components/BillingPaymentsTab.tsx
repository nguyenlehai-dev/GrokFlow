import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, Pencil } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AdminPayment } from "../models/payment";
import { paymentsService } from "../services/payments.service";
import { formatVnd, formatDateTime as formatDate } from "@/core/utils/format";
import { BillingPaymentEditorModal } from "./BillingPaymentEditorModal";

export function BillingPaymentsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<AdminPayment | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: payments, isLoading } = useQuery({
    queryKey: ["admin-payments", statusFilter],
    queryFn: () => paymentsService.list(statusFilter || undefined),
  });

  const remove = useMutation({
    mutationFn: (id: string) => paymentsService.remove(id),
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
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
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
                <tr key={p.id} className="border-t hover:bg-white">
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
        <BillingPaymentEditorModal
          pay={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
