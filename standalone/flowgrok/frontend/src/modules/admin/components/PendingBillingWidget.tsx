import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Crown, Check, X, Clock, Inbox } from "lucide-react";

import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import { subscriptionsService } from "../services/subscriptions.service";

interface PendingRow {
  subscription_id: string;
  user_email: string;
  user_id: string;
  plan_code: string;
  plan_name: string;
  amount: number;
  currency: string;
  billing_cycle: string;
  created_at: string | null;
}

interface PendingBillingResponse {
  count: number;
  items: PendingRow[];
}

/** Admin-dashboard widget that surfaces user-side checkout requests
 *  waiting for confirmation. Polls every 30s so a new request shows up
 *  without the admin having to manually refresh; clicking "Xác nhận"
 *  triggers the same `confirm_payment` mutation the Billing Manager
 *  uses, then optimistically invalidates the dashboard summary.
 */
export function PendingBillingWidget() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<PendingBillingResponse>({
    queryKey: ["pending-billing"],
    queryFn: async () =>
      (await api.get<PendingBillingResponse>("/api/dashboard/admin/pending-billing")).data,
    refetchInterval: 30_000,
  });

  const confirmMut = useMutation({
    mutationFn: (subscription_id: string) =>
      subscriptionsService.confirmPayment(subscription_id),
    onSuccess: (_d, subId) => {
      toast(t("common.saved"), "success");
      qc.invalidateQueries({ queryKey: ["pending-billing"] });
      qc.invalidateQueries({ queryKey: ["billing-summary"] });
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      void subId;
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail?.message ?? t("common.error"), "error"),
  });

  const rejectMut = useMutation({
    mutationFn: (subscription_id: string) =>
      subscriptionsService.update(subscription_id, { status: "cancelled" }),
    onSuccess: () => {
      toast(t("common.saved"), "info");
      qc.invalidateQueries({ queryKey: ["pending-billing"] });
    },
    onError: (e: any) =>
      toast(e?.response?.data?.detail?.message ?? t("common.error"), "error"),
  });

  if (isLoading) {
    return (
      <section className="card">
        <Header count={0} t={t} />
        <p className="mt-3 text-sm text-slate-500">{t("common.loading")}</p>
      </section>
    );
  }

  const items = data?.items ?? [];
  const count = data?.count ?? 0;

  return (
    <section className="card">
      <Header count={count} t={t} />
      {items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
          <Inbox size={20} className="mx-auto text-slate-400" />
          <p className="mt-2 text-sm text-slate-500">{t("admin.billing_pending_empty")}</p>
          <p className="mt-1 text-xs text-slate-400">{t("admin.billing_pending_hint")}</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {items.map((r) => (
            <li key={r.subscription_id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Crown size={14} className="text-amber-600 shrink-0" />
                  <p className="truncate text-sm font-medium text-slate-800">
                    {r.user_email}
                  </p>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200">
                    {r.plan_name}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {r.amount.toLocaleString("vi-VN")} {r.currency}
                  </span>
                  <span className="mx-1.5">·</span>
                  {r.billing_cycle}
                  {r.created_at && (
                    <>
                      <span className="mx-1.5">·</span>
                      <Clock size={10} className="inline -translate-y-px" />{" "}
                      {fmtRelative(r.created_at)}
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => confirmMut.mutate(r.subscription_id)}
                  disabled={confirmMut.isPending}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check size={12} /> {t("admin.billing_confirm")}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`${t("common.confirm_delete")} ${r.user_email}`)) {
                      rejectMut.mutate(r.subscription_id);
                    }
                  }}
                  disabled={rejectMut.isPending}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  title={t("common.delete")}
                >
                  <X size={12} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3 text-right">
        <Link
          to="/admin/billing"
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          {t("admin.billing_open_manager")}
        </Link>
      </div>
    </section>
  );
}

function Header({
  count, t,
}: { count: number; t: (k: string) => string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">
          {t("admin.billing_pending_title")}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {t("admin.billing_pending_subtitle")}
        </p>
      </div>
      {count > 0 && (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
          {count}
        </span>
      )}
    </div>
  );
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return "vừa xong";
  const m = Math.floor(diffMs / 60_000);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}
