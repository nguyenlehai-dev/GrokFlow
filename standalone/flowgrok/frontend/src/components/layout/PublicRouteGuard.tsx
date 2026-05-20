import { Navigate } from "react-router-dom";
import { useDomainStore } from "@/core/domain/store";
import { useAuthStore } from "@/core/auth/store";
import { MaintenancePage } from "@/components/ui/MaintenancePage";
import type { ReactNode } from "react";

type PublicFlag = "allow_landing" | "allow_register" | "allow_login";

/** Wraps public routes so admin can disable them per-domain.
 *
 *  Behavior when blocked: redirects to /login (the most universally useful
 *  fallback), unless the user is trying to reach /login itself (in which case
 *  we render a friendly "not available" panel to avoid a redirect loop).
 */
export function PublicRouteGuard({
  flag, fallback = "/login", children,
}: {
  flag: PublicFlag;
  fallback?: string;
  children: ReactNode;
}) {
  const config = useDomainStore((s) => s.config);
  const loaded = useDomainStore((s) => s.loaded);
  const user = useAuthStore((s) => s.user);

  // Until the config arrives, render the route — fail-open during the boot
  // tick avoids a flash of "blocked" UI for legitimate visitors.
  if (!loaded || !config) return <>{children}</>;

  // Per-domain maintenance window — toggle OR elapsed schedule. Admins
  // still get through so they can finish the patch from /admin/domains.
  const inMaintenance = (() => {
    if (config.maintenance_mode) return true;
    if (config.maintenance_starts_at) {
      const ts = new Date(config.maintenance_starts_at).getTime();
      if (!isNaN(ts) && ts <= Date.now()) return true;
    }
    return false;
  })();
  if (inMaintenance) {
    const isAdmin = user?.role === "admin" || user?.role === "super_admin";
    if (!isAdmin) return <MaintenancePage />;
  }

  if (config.status === "disabled") {
    return <BlockedPanel reason="Domain bị disable bởi admin" />;
  }
  if (!config[flag]) {
    if (flag === "allow_login") {
      return <BlockedPanel reason="Trang đăng nhập không khả dụng trên domain này" />;
    }
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}

function BlockedPanel({ reason }: { reason: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-white px-4">
      <div className="card max-w-md text-center">
        <h2 className="text-lg font-semibold text-white">Trang không khả dụng</h2>
        <p className="text-sm text-slate-600 mt-2">{reason}</p>
      </div>
    </div>
  );
}
