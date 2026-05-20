import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/Toast";
import type { AdminPayment } from "../models/payment";
import { paymentsService } from "../services/payments.service";
import { usersService } from "../services/users.service";

export function BillingPaymentEditorModal({
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
    queryFn: () => usersService.list(),
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
        ? paymentsService.create(payload)
        : paymentsService.update(pay!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
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
