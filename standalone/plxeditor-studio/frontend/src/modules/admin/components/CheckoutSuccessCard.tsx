import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import type { CheckoutResp } from "../models/billing";

export function CheckoutSuccessCard({
  result, planName, cycle,
}: { result: CheckoutResp; planName: string; cycle: string }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-2xl space-y-4">
      <div className="card space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Info size={20} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t("admin.checkout_success_title")}</h2>
            <p className="text-sm text-slate-600">
              {t("admin.checkout_success_invoice_label")}{" "}
              <span className="font-mono font-semibold">{result.invoice_number}</span> ·{" "}
              {planName} ({cycle})
            </p>
          </div>
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold mb-1">{t("admin.checkout_success_pay_instructions")}</p>
          <p className="whitespace-pre-line">{result.instructions}</p>
        </div>

        <div className="rounded-md border border-slate-200 p-3 space-y-1 text-sm">
          <div className="font-semibold mb-1">{t("admin.checkout_success_bank_title")}</div>
          <div>{t("admin.checkout_success_bank_name")}: <strong>Vietcombank</strong></div>
          <div>{t("admin.checkout_success_account_no")}: <strong>1234567890</strong></div>
          <div>{t("admin.checkout_success_account_holder")}: <strong>NGUYEN LE HAI</strong></div>
          <div>
            {t("admin.checkout_success_transfer_note")}: <span className="font-mono font-bold text-rose-600">{result.invoice_number}</span>
          </div>
          <div className="pt-1 text-slate-600">
            {t("admin.checkout_success_amount")}: <strong>{new Intl.NumberFormat("vi-VN").format(Number(result.amount))}₫</strong>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Link to="/billing" className="btn-primary">{t("admin.checkout_success_view_billing")}</Link>
          <Link to="/dashboard" className="btn-ghost">{t("admin.checkout_success_back_dashboard")}</Link>
        </div>
      </div>
    </div>
  );
}
