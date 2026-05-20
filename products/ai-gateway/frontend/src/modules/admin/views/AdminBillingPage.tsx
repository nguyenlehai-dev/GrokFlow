import { AdminGuard } from "../components/AdminGuard";
import { AdminBillingTab } from "../components/AdminBillingTab";

export function AdminBillingPage() {
  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="page-title">Admin — Billing</h1>
        <AdminBillingTab />
      </div>
    </AdminGuard>
  );
}
