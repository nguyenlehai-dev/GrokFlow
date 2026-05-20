import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, CreditCard, Receipt } from "lucide-react";
import { BillingSubscriptionsTab } from "./BillingSubscriptionsTab";
import { BillingPaymentsTab } from "./BillingPaymentsTab";
import { BillingInvoicesTab } from "./BillingInvoicesTab";

type SubTab = "subscriptions" | "payments" | "invoices";

export function AdminBillingTab() {
  const { t } = useTranslation();
  const [sub, setSub] = useState<SubTab>("subscriptions");
  return (
    <div className="space-y-3">
      <div className="tabs-scroll">
        <SubTabBtn active={sub === "subscriptions"} onClick={() => setSub("subscriptions")} icon={CreditCard}>
          {t("admin.adminbilling_subscriptions")}
        </SubTabBtn>
        <SubTabBtn active={sub === "payments"} onClick={() => setSub("payments")} icon={Receipt}>
          {t("admin.adminbilling_payments")}
        </SubTabBtn>
        <SubTabBtn active={sub === "invoices"} onClick={() => setSub("invoices")} icon={FileText}>
          {t("admin.adminbilling_invoices")}
        </SubTabBtn>
      </div>
      {sub === "subscriptions" && <BillingSubscriptionsTab />}
      {sub === "payments" && <BillingPaymentsTab />}
      {sub === "invoices" && <BillingInvoicesTab />}
    </div>
  );
}

function SubTabBtn({
  active, onClick, children, icon: Icon,
}: { active: boolean; onClick: () => void; children: React.ReactNode; icon: any }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 transition ${
        active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      <Icon size={14} />
      {children}
    </button>
  );
}
