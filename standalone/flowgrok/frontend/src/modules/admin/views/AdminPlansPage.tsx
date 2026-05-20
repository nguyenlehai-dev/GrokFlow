import { useTranslation } from "react-i18next";
import { AdminGuard } from "../components/AdminGuard";
import { PlansTab } from "../components/PlansTab";

export function AdminPlansPage() {
  const { t } = useTranslation();
  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="page-title">{t("admin.plans_title")}</h1>
        <PlansTab />
      </div>
    </AdminGuard>
  );
}
