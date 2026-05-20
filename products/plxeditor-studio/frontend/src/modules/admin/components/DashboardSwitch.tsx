import { lazy, Suspense } from "react";
import { useAuthStore } from "@/core/auth/store";

/** Picks which dashboard to render based on the current user's role.
 *
 *  - super_admin → original system-wide DashboardPage (per-domain breakdown,
 *    revenue, system filters).
 *  - everyone else → TenantDashboardPage (brand greeting + quick-actions
 *    filtered by domain.allowed_pages + tenant-scoped KPIs + recent jobs).
 *
 *  Each variant lazy-loads independently so a tenant user never downloads
 *  the heavy admin charts and vice versa.
 */
const SystemDashboard = lazy(() =>
  import("../views/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const TenantDashboard = lazy(() =>
  import("../views/TenantDashboardPage").then((m) => ({ default: m.TenantDashboardPage })),
);

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
    </div>
  );
}

export function DashboardSwitch() {
  const role = useAuthStore((s) => s.user?.role);
  const Page = role === "super_admin" ? SystemDashboard : TenantDashboard;
  return (
    <Suspense fallback={<Spinner />}>
      <Page />
    </Suspense>
  );
}
