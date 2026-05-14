import { Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { api } from "@/core/api/axios";
import { useAuthStore, userCanSeePath } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import { MaintenancePage } from "@/components/ui/MaintenancePage";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const domainConfig = useDomainStore((s) => s.config);
  const isPageAllowed = useDomainStore((s) => s.isPageAllowed);
  const firstAllowedPath = useDomainStore((s) => s.firstAllowedPath);
  const location = useLocation();

  // Per-domain maintenance mode: non-admin users see the maintenance
  // screen regardless of which authed route they tried to hit. Admins
  // still get through so they can finish the patch from /admin/domains.
  if (domainConfig?.maintenance_mode) {
    const isAdmin = user?.role === "admin" || user?.role === "super_admin";
    if (!isAdmin) return <MaintenancePage />;
  }

  // Refresh /me on app boot — keeps cached entitlements in sync after admin
  // changes the user's plan/overrides server-side. Skip if no token.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get("/api/auth/me");
        if (!cancelled) setUser(r.data);
      } catch {
        /* keep cached state — auth interceptor handles 401s */
      }
    })();
  }, [token]);

  if (!token) {
    // No login → push to landing if domain allows, else to login.
    if (domainConfig && !domainConfig.allow_landing) {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to="/landing" replace />;
  }

  // userCanSeePath knows the tier rules:
  //   super_admin  → always true
  //   admin        → /admin/{users,roles} always; rest scoped to domain
  //   user/support → role ∩ domain
  if (!userCanSeePath(user ?? null, location.pathname, isPageAllowed)) {
    const target = firstAllowedPath();
    // Avoid an infinite redirect if even the fallback target isn't allowed —
    // render the block panel so the user sees what's going on.
    if (target !== location.pathname && isPageAllowed(target)) {
      return <Navigate to={target} replace />;
    }
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="card max-w-md text-center">
          <h2 className="text-lg font-semibold text-slate-900">Trang không khả dụng</h2>
          <p className="text-sm text-slate-600 mt-2">
            Domain <code className="font-mono">{domainConfig?.hostname}</code> chưa được cấp quyền vào trang nào.
          </p>
          <p className="text-xs text-slate-500 mt-3">
            Liên hệ admin để được cấp quyền.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
