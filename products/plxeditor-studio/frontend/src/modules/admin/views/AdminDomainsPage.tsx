import { useTranslation } from "react-i18next";
import { AdminGuard } from "../components/AdminGuard";
import { AdminDomainsTab } from "../components/AdminDomainsTab";

export function AdminDomainsPage() {
  const { t } = useTranslation();
  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="page-title">{t("admin.domains_title")}</h1>
        <AdminDomainsTab />
      </div>
    </AdminGuard>
  );
}
