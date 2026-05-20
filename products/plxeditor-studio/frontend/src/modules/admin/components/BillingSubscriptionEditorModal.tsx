import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/Toast";
import type { AdminSubscription } from "../models/subscription";
import { subscriptionsService } from "../services/subscriptions.service";
import { usersService } from "../services/users.service";
import { plansService } from "../services/plans.service";

export function BillingSubscriptionEditorModal({
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
    queryFn: () => usersService.list(),
  });
  const { data: plans } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => plansService.list(),
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
        ? subscriptionsService.create(payload)
        : subscriptionsService.update(sub!.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      toast(isCreate ? "Đã tạo" : "Đã lưu", "success");
      onClose();
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? "Lỗi lưu", "error"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
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
