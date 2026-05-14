import { AdminGuard } from "./AdminGuard";
import { PlansTab } from "./AdminPage";

export function AdminPlansPage() {
  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="page-title">Admin — Plans / Gói</h1>
        <PlansTab />
      </div>
    </AdminGuard>
  );
}
