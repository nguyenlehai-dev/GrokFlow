import { useState } from "react";
import { useParams, useSearchParams, Link, Navigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { CreditCard, Building2, Wallet, Smartphone, Globe } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import type { CheckoutResp } from "../models/billing";
import { plansService } from "../services/plans.service";
import { billingService } from "../services/billing.service";
import { formatVnd } from "@/core/utils/format";
import { CheckoutSuccessCard } from "../components/CheckoutSuccessCard";

const PROVIDERS = [
  { code: "manual", labelKey: "billing.co_provider_manual", icon: Building2, hintKey: "billing.co_provider_manual_hint" },
  { code: "momo", labelKey: "billing.co_provider_momo", icon: Wallet, hintKey: "billing.co_provider_coming", disabled: true },
  { code: "vnpay", labelKey: "billing.co_provider_vnpay", icon: CreditCard, hintKey: "billing.co_provider_coming", disabled: true },
  { code: "zalopay", labelKey: "billing.co_provider_zalopay", icon: Smartphone, hintKey: "billing.co_provider_coming", disabled: true },
  { code: "stripe", labelKey: "billing.co_provider_stripe", icon: Globe, hintKey: "billing.co_provider_coming", disabled: true },
];

export function CheckoutPage() {
  const { t } = useTranslation();
  const { plan_code } = useParams<{ plan_code: string }>();
  const [params] = useSearchParams();
  const cycle = (params.get("cycle") === "yearly" ? "yearly" : "monthly") as "monthly" | "yearly";
  const [provider, setProvider] = useState("manual");
  const [result, setResult] = useState<CheckoutResp | null>(null);
  const { register, handleSubmit } = useForm<{
    name: string;
    company: string;
    tax_code: string;
    address: string;
  }>();

  const { data: plans } = useQuery({
    queryKey: ["plans-public"],
    queryFn: () => plansService.listPublic(),
  });
  const plan = plans?.find((p) => p.code === plan_code);

  const checkout = useMutation({
    mutationFn: (billing_info: any) =>
      billingService.checkout({
        plan_code,
        billing_cycle: cycle,
        provider,
        billing_info,
      }),
    onSuccess: (data) => {
      setResult(data);
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        toast(t("billing.co_created_ok"), "success");
      }
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail?.message ?? t("billing.co_create_error"), "error");
    },
  });

  if (!plan_code) return <Navigate to="/pricing" replace />;
  if (!plans) return <p className="text-slate-500">{t("common.loading")}</p>;
  if (!plan) return <Navigate to="/pricing" replace />;
  if (plan.price_vnd === null || plan.price_vnd === 0) return <Navigate to="/pricing" replace />;

  const amount = cycle === "yearly" ? plan.price_vnd * 10 : plan.price_vnd;
  const cycleLabel = cycle === "yearly" ? t("billing.co_cycle_yearly") : t("billing.co_cycle_monthly");

  if (result) {
    return <CheckoutSuccessCard result={result} planName={plan.name} cycle={cycle} />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="page-title">{t("billing.co_title")}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t("billing.co_subtitle", { plan: plan.name, cycle: cycleLabel })}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1">
          <div className="card sticky top-4">
            <h2 className="font-semibold mb-2">{t("billing.co_order_summary")}</h2>
            <div className="space-y-2 text-sm">
              <Row label={t("billing.co_row_plan")} value={plan.name} />
              <Row label={t("billing.co_row_cycle")} value={cycle === "yearly" ? t("billing.co_row_cycle_yearly") : t("billing.co_row_cycle_monthly")} />
              <Row
                label={t("billing.co_row_price")}
                value={formatVnd(plan.price_vnd ?? 0)}
                sub={cycle === "yearly" ? t("billing.co_row_price_sub_yearly") : t("billing.co_row_price_sub_monthly")}
              />
              <hr className="my-2" />
              <Row label={t("billing.co_subtotal")} value={formatVnd(amount)} />
              <Row label={t("billing.co_vat")} value="0₫" />
              <hr className="my-2" />
              <div className="flex items-center justify-between">
                <span className="font-semibold">{t("billing.co_total")}</span>
                <span className="text-xl font-bold text-brand-600">{formatVnd(amount)}</span>
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit((v) => checkout.mutate(v))}
          className="md:col-span-2 space-y-4"
        >
          <section className="card space-y-2">
            <h2 className="font-semibold">{t("billing.co_method")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PROVIDERS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.code}
                    type="button"
                    disabled={p.disabled}
                    onClick={() => !p.disabled && setProvider(p.code)}
                    className={`text-left border rounded-md px-3 py-3 transition flex items-start gap-3 ${
                      provider === p.code
                        ? "border-brand-500 bg-brand-50"
                        : "border-slate-200 hover:border-slate-200"
                    } ${p.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <Icon size={18} className="text-slate-700 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{t(p.labelKey)}</div>
                      <div className="text-xs text-slate-500">{t(p.hintKey)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">{t("billing.co_invoice_title")}</h2>
            <p className="text-xs text-slate-500">{t("billing.co_invoice_hint")}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("billing.co_invoice_name")}</label>
                <input className="input" {...register("name")} />
              </div>
              <div>
                <label className="text-sm font-medium">{t("billing.co_invoice_company")}</label>
                <input className="input" {...register("company")} />
              </div>
              <div>
                <label className="text-sm font-medium">{t("billing.co_invoice_tax")}</label>
                <input className="input" placeholder="0123456789" {...register("tax_code")} />
              </div>
              <div>
                <label className="text-sm font-medium">{t("billing.co_invoice_address")}</label>
                <input className="input" {...register("address")} />
              </div>
            </div>
          </section>

          <div className="flex items-center gap-3 justify-end">
            <Link to="/pricing" className="btn-ghost">{t("billing.co_back")}</Link>
            <button
              type="submit"
              disabled={checkout.isPending}
              className="btn-primary px-6"
            >
              {checkout.isPending
                ? t("billing.co_pay_processing")
                : t("billing.co_pay_btn", { amount: formatVnd(amount) })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-slate-600">{label}</div>
        {sub && <div className="text-xs text-slate-400">{sub}</div>}
      </div>
      <div className="text-slate-800 font-medium text-right">{value}</div>
    </div>
  );
}
