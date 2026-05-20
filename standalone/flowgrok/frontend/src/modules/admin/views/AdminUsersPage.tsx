import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/core/auth/store";
import { AdminGuard } from "../components/AdminGuard";
import { UsersTab } from "../components/UsersTab";

export function AdminUsersPage() {
  return (
    <AdminGuard>
      <Inner />
    </AdminGuard>
  );
}

function Inner() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("admin.users_title")}</h1>
      <UsersTab meId={me!.id} />
    </div>
  );
}
