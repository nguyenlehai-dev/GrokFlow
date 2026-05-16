import { Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { api } from "@/core/api/axios";
import { useAuthStore, userCanSeePath } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import { setLocale } from "@/core/i18n";
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

  // ⚠️ Rules of Hooks — every useEffect MUST run before any early return,
  // otherwise React's hook-call order changes between renders (maintenance
  // toggling mid-session would cause a runtime crash).
  //
  // Refresh /me on app boot so cached entitlements stay in sync after an
  // admin changes the user's plan / overrides server-side. Skip when
  // there's no token to avoid an unauth API call.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get("/api/auth/me");
        if (cancelled) return;
        setUser(r.data);
        // Sync i18next with the user's saved preference so a fresh login
        // on a new device picks up the right language immediately —
        // without this it would only honour browser detection / localStorage.
        if (r.data?.locale) setLocale(r.data.locale);
      } catch {
        /* keep cached state — axios interceptor handles 401s */
      }
    })();
    return () => { cancelled = true; };
  }, [token, setUser]);

  // Per-domain maintenance: visible to non-admin users when EITHER the
  // toggle is on OR a scheduled window has elapsed. Admins still get
  // through (so they can finish the patch); they can preview the screen
  // with `?preview=maintenance`.
  const effectiveMaintenance = (() => {
    if (!domainConfig) return false;
    if (domainConfig.maintenance_mode) return true;
    if (domainConfig.maintenance_starts_at) {
      const ts = new Date(domainConfig.maintenance_starts_at).getTime();
      if (!isNaN(ts) && ts <= Date.now()) return true;
    }
    return false;
  })();
  if (effectiveMaintenance) {
    const isAdmin = user?.role === "admin" || user?.role === "super_admin";
    const previewing = new URLSearchParams(location.search).get("preview") === "maintenance";
    if (!isAdmin || previewing) return <MaintenancePage />;
  }

  if (!token) {
    // No login → push to landing if the domain allows it, else /login.
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
    // Avoid an infinite redirect if even the fallback isn't allowed —
    // render the block panel so the user sees what's going on.
    if (target !== location.pathname && isPageAllowed(target)) {
      return <Navigate to={target} replace />;
    }
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="card max-w-md text-center">
          <h2 className="text-lg font-semibold text-slate-800">Trang không khả dụng</h2>
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
