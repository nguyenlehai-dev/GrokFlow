import { AdminGuard } from "./AdminGuard";
import { AdminDomainsTab } from "./AdminDomainsTab";

export function AdminDomainsPage() {
  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="page-title">Admin — Domains</h1>
        <AdminDomainsTab />
      </div>
    </AdminGuard>
  );
}
