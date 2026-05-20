import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";

/** Verifies admin role via fresh /me before mounting admin-only children.
 *  Same logic that used to live inside the old single-page AdminPage — now
 *  shared by every /admin/* sub-route.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get("/api/auth/me");
        if (cancelled) return;
        setUser(r.data);
        if (r.data?.role !== "admin" && r.data?.role !== "super_admin") {
          toast("Tài khoản này không có quyền admin", "error");
          navigate("/dashboard", { replace: true });
          return;
        }
        setVerified(true);
      } catch (e: any) {
        if (e?.response?.status === 401) {
          clear();
          navigate("/login", { replace: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (me?.role !== "admin" && me?.role !== "super_admin") return <Navigate to="/dashboard" replace />;
  if (!verified) return <p className="text-slate-500">Đang xác thực quyền admin...</p>;
  return <>{children}</>;
}
