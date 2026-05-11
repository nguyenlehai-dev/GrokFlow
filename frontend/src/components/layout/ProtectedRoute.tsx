import { Navigate } from "react-router-dom";
import { useEffect } from "react";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);

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
    return () => { cancelled = true; };
  }, [token]);

  if (!token) return <Navigate to="/landing" replace />;
  return <>{children}</>;
}
