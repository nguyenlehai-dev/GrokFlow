import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/Toast";
import type { AdminInvoice } from "../models/invoice";
import { invoicesService } from "../services/invoices.service";
import { usersService } from "../services/users.service";

export function BillingInvoiceEditorModal({
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
    queryFn: () => usersService.list(),
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
        ? invoicesService.create(payload)
        : invoicesService.update(inv!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
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
