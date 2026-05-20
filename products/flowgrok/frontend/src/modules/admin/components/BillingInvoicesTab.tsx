import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus, Pencil } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AdminInvoice } from "../models/invoice";
import { invoicesService } from "../services/invoices.service";
import { formatVnd, formatDate as formatDateOnly } from "@/core/utils/format";
import { BillingInvoiceEditorModal } from "./BillingInvoiceEditorModal";

export function BillingInvoicesTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<AdminInvoice | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["admin-invoices", statusFilter],
    queryFn: () => invoicesService.list(statusFilter || undefined),
  });

  const remove = useMutation({
    mutationFn: (id: string) => invoicesService.remove(id),
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
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-white text-left">
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
                <tr key={i.id} className="border-t hover:bg-white">
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
        <BillingInvoiceEditorModal
          inv={editing}
          isCreate={creating}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
