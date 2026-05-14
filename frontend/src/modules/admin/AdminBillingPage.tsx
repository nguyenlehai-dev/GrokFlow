import { AdminGuard } from "./AdminGuard";
import { AdminBillingTab } from "./AdminBillingTab";

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
