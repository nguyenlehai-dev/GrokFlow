import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Wallet, Crown, ChevronRight, ChevronDown,
} from "lucide-react";

import { toast } from "@/components/ui/Toast";
import { useAuthStore } from "@/core/auth/store";
import { HelpButton } from "@/components/ui/HelpButton";
import { getBillingHelpSteps, getBillingHelpFaq } from "../configs/billing-help";
import { AdminBillingTab } from "../components/AdminBillingTab";
import { billingService } from "../services/billing.service";
import { subscriptionsService } from "../services/subscriptions.service";
import { BillingPersonalBody } from "../components/BillingPersonalBody";

export function BillingPage() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  const isSuper = me?.role === "super_admin";
  const isAdmin = me?.role === "admin" || isSuper;

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["billing-summary"],
    queryFn: () => billingService.summary(),
  });

  const cancel = useMutation({
    mutationFn: (subId: string) => subscriptionsService.cancelOwn(subId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing-summary"] });
      toast(t("billing.cancel_ok"), "success");
    },
    onError: (e: any) => toast(e?.response?.data?.detail?.message ?? t("billing.cancel_error"), "error"),
  });

  // Section collapse state — admin sees system block expanded by default,
  // personal-billing section collapsed (less interesting for super_admin).
  const [openSystem, setOpenSystem] = useState(isSuper);
  const [openPersonal, setOpenPersonal] = useState(!isSuper);

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="rounded-xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 text-white p-6 shadow-lg">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80 font-semibold">
              Billing {isSuper && t("billing.page_hero_admin_subtitle")}
            </p>
            <h1 className="text-2xl font-bold mt-0.5 flex items-center gap-2">
              <Wallet size={22} />
              {isSuper ? t("billing.page_hero_super_title") : t("billing.page_hero_user_title")}
            </h1>
            <p className="text-sm opacity-90 mt-1">
              {isSuper ? t("billing.page_hero_super_desc") : t("billing.page_hero_user_desc")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <HelpButton
              variant="inline"
              title={t("billing.help_title")}
              intro={t("billing.help_intro")}
              steps={getBillingHelpSteps(t)}
              faq={getBillingHelpFaq(t)}
              className="!border-white/30 !bg-white/10 !text-white hover:!bg-white/20"
            />
            <Link
              to="/pricing"
              className="inline-flex items-center gap-1.5 rounded-md bg-white/15 hover:bg-white/25 backdrop-blur-sm px-4 py-2 text-sm font-medium border border-white/30"
            >
              <Crown size={14} /> {t("billing.upgrade_btn")}
            </Link>
          </div>
        </div>
      </div>

      {/* SYSTEM-WIDE BILLING — admin / super_admin only */}
      {isAdmin && (
        <section className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <button
            onClick={() => setOpenSystem(!openSystem)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-white transition border-b border-slate-200"
          >
            <div className="flex items-center gap-2 text-left">
              <Crown size={16} className="text-amber-600" />
              <div>
                <h2 className="font-semibold text-slate-800">
                  {isSuper ? t("billing.system_title_super") : t("billing.system_title_admin")}
                </h2>
                <p className="text-xs text-slate-500">{t("billing.system_desc")}</p>
              </div>
            </div>
            {openSystem ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </button>
          {openSystem && (
            <div className="p-5 bg-white/30">
              <AdminBillingTab />
            </div>
          )}
        </section>
      )}

      {/* PERSONAL BILLING — everyone */}
      <section className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
        <button
          onClick={() => setOpenPersonal(!openPersonal)}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-white transition border-b border-slate-200"
        >
          <div className="flex items-center gap-2 text-left">
            <Wallet size={16} className="text-emerald-600" />
            <div>
              <h2 className="font-semibold text-slate-800">{t("billing.personal_title")}</h2>
              <p className="text-xs text-slate-500">
                {t("billing.personal_desc")}{" "}
                <code className="font-mono">{me?.email}</code>
              </p>
            </div>
          </div>
          {openPersonal ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {openPersonal && (
          <div className="p-5 space-y-5">
            {isLoading ? (
              <p className="text-slate-500 text-sm">{t("common.loading")}</p>
            ) : (
              <BillingPersonalBody
                data={data}
                onCancel={(id) => {
                  if (confirm(t("billing.cancel_confirm"))) {
                    cancel.mutate(id);
                  }
                }}
                onCancelPending={(id) => {
                  if (confirm(t("billing.cancel_pending_confirm"))) cancel.mutate(id);
                }}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
