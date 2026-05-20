import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2, Clock, AlertCircle, FileText, Download, X, Wallet,
} from "lucide-react";
import type { Subscription } from "../models/subscription";
import type { BillingSummary as Summary } from "../models/billing";
import { formatVnd, formatDate } from "@/core/utils/format";

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

export function BillingStatusPill({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

export function BillingPersonalBody({
  data, onCancel, onCancelPending,
}: {
  data: Summary | undefined;
  onCancel: (id: string) => void;
  onCancelPending: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <CurrentSubscriptionCard sub={data?.current_subscription} onCancel={onCancel} />

      {data?.pending_subscriptions && data.pending_subscriptions.length > 0 && (
        <section className="rounded-md ring-1 ring-amber-200 bg-amber-50/50 p-4 space-y-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Clock size={16} className="text-amber-600" /> {t("admin.bp_pending_title")}
          </h3>
          <p className="text-xs text-slate-600">
            {t("admin.bp_pending_desc")}
          </p>
          <div className="divide-y divide-amber-200">
            {data.pending_subscriptions.map((s) => (
              <PendingRow key={s.id} sub={s} onCancel={onCancelPending} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <DataCard title={t("admin.bp_recent_invoices")} icon={FileText}>
          {data?.recent_invoices?.length === 0 ? (
            <p className="text-sm text-slate-500 italic px-3 py-6 text-center">
              {t("admin.bp_no_invoices")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white text-left text-slate-600 text-xs">
                <tr>
                  <th className="px-3 py-2">{t("admin.bp_col_invoice_no")}</th>
                  <th className="px-3 py-2">{t("admin.bp_col_date")}</th>
                  <th className="px-3 py-2">{t("admin.bp_col_amount")}</th>
                  <th className="px-3 py-2">{t("admin.bp_col_status")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data?.recent_invoices?.map((i) => (
                  <tr key={i.id} className="hover:bg-white">
                    <td className="px-3 py-2 font-mono text-xs">{i.invoice_number}</td>
                    <td className="px-3 py-2 text-slate-600 text-xs">{formatDate(i.issued_at ?? i.created_at)}</td>
                    <td className="px-3 py-2 font-semibold">{formatVnd(i.total)}</td>
                    <td className="px-3 py-2"><BillingStatusPill status={i.status} /></td>
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

        <DataCard title={t("admin.bp_recent_payments")} icon={Wallet}>
          {data?.recent_payments?.length === 0 ? (
            <p className="text-sm text-slate-500 italic px-3 py-6 text-center">
              {t("admin.bp_no_payments")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white text-left text-slate-600 text-xs">
                <tr>
                  <th className="px-3 py-2">{t("admin.bp_col_date")}</th>
                  <th className="px-3 py-2">{t("admin.bp_col_amount")}</th>
                  <th className="px-3 py-2">{t("admin.bp_col_provider")}</th>
                  <th className="px-3 py-2">{t("admin.bp_col_status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data?.recent_payments?.map((p) => (
                  <tr key={p.id} className="hover:bg-white">
                    <td className="px-3 py-2 text-slate-600 text-xs">{formatDate(p.paid_at ?? p.created_at)}</td>
                    <td className="px-3 py-2 font-semibold">{formatVnd(p.amount)}</td>
                    <td className="px-3 py-2 capitalize text-xs">{p.provider}</td>
                    <td className="px-3 py-2"><BillingStatusPill status={p.status} /></td>
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
}: { title: string; icon: any; children: ReactNode }) {
  return (
    <div className="rounded-lg ring-1 ring-slate-200 bg-white overflow-hidden">
      <h3 className="px-4 py-2.5 border-b border-slate-200 bg-white font-semibold text-slate-800 text-sm flex items-center gap-2">
        <Icon size={14} /> {title}
      </h3>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function CurrentSubscriptionCard({
  sub, onCancel,
}: { sub: Subscription | null | undefined; onCancel: (id: string) => void }) {
  const { t } = useTranslation();
  if (!sub) {
    return (
      <div className="rounded-lg ring-1 ring-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <h3 className="font-semibold mb-2 flex items-center gap-2 text-slate-800">
          <AlertCircle size={16} className="text-slate-400" /> {t("admin.bp_no_sub_title")}
        </h3>
        <p className="text-sm text-slate-600 mb-3">
          {t("admin.bp_no_sub_desc")}
        </p>
        <Link to="/pricing" className="btn-primary inline-block">{t("admin.bp_view_plans")}</Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg ring-1 ring-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2 text-slate-800">
            <CheckCircle2 size={16} className="text-emerald-600" /> {t("admin.bp_current_sub")}
          </h3>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-bold text-slate-800">{sub.plan_name}</span>
            <BillingStatusPill status={sub.status} />
          </div>
          <p className="text-sm text-slate-600 mt-1">
            <strong className="text-emerald-700">{formatVnd(sub.amount)}</strong>{" "}
            / {sub.billing_cycle === "yearly" ? t("admin.bp_per_year") : t("admin.bp_per_month")}
          </p>
        </div>
        {!sub.cancel_at_period_end && (
          <button
            onClick={() => onCancel(sub.id)}
            className="btn-ghost text-rose-600 text-sm"
            title={t("admin.bp_cancel_sub_title")}
          >
            <X size={14} className="inline mr-1" /> {t("admin.bp_cancel")}
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm border-t border-emerald-200 pt-3">
        <Field label={t("admin.bp_period_start")} value={formatDate(sub.current_period_start)} />
        <Field label={t("admin.bp_period_end")} value={formatDate(sub.current_period_end)} />
        <Field label={t("admin.bp_provider")} value={sub.provider} mono />
      </div>

      {sub.cancel_at_period_end && (
        <div className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {t("admin.bp_cancel_scheduled", { date: formatDate(sub.current_period_end) })}
        </div>
      )}
    </div>
  );
}

function PendingRow({ sub, onCancel }: { sub: Subscription; onCancel: (id: string) => void }) {
  const { t } = useTranslation();
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
        {t("admin.bp_cancel_order")}
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
