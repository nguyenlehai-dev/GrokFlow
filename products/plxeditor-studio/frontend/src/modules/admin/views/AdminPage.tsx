import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";
import { AdminBillingTab } from "../components/AdminBillingTab";
import { AdminDomainsTab } from "../components/AdminDomainsTab";
import { StatsBlock } from "../components/StatsBlock";
import { UsersTab } from "../components/UsersTab";
import { PlansTab } from "../components/PlansTab";

export function AdminPage() {
  // Hooks MUST run before any conditional return — otherwise React throws
  // "Rendered more hooks than during the previous render" when the role
  // changes between render passes (e.g. /me refresh).
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const [tab, setTab] = useState<"users" | "plans" | "billing" | "domains">("users");
  // Re-fetch /me on mount: cached role from localStorage may be stale (e.g.
  // user logged in as admin earlier, then got demoted, then opened /admin
  // from cache → backend rejects with 403 even though the cached gate let
  // them through). Source of truth = backend.
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get("/api/auth/me");
        if (cancelled) return;
        setUser(r.data);
        if ((r.data?.role !== "admin" && r.data?.role !== "super_admin")) {
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

  // While the cached role isn't admin we don't want to even mount the
  // queries (they'd 403). Render a redirect immediately.
  if ((me?.role !== "admin" && me?.role !== "super_admin")) return <Navigate to="/dashboard" replace />;

  // Wait for the fresh /me confirmation so admin queries don't fire with a
  // stale token (e.g. cache says admin, DB says user → 403).
  if (!verified) {
    return <p className="text-slate-500">Đang xác thực quyền admin...</p>;
  }

  const isSuper = me?.role === "super_admin";
  return (
    <div className="space-y-6">
      <h1 className="page-title">Admin</h1>
      <StatsBlock />
      <div className="tabs-scroll">
        <TabButton active={tab === "users"} onClick={() => setTab("users")}>Users</TabButton>
        {isSuper && <TabButton active={tab === "plans"} onClick={() => setTab("plans")}>Plans / Gói</TabButton>}
        {isSuper && <TabButton active={tab === "billing"} onClick={() => setTab("billing")}>Billing</TabButton>}
        {isSuper && <TabButton active={tab === "domains"} onClick={() => setTab("domains")}>Domains</TabButton>}
      </div>
      {tab === "users" && <UsersTab meId={me.id} />}
      {tab === "plans" && <PlansTab />}
      {tab === "billing" && <AdminBillingTab />}
      {tab === "domains" && <AdminDomainsTab />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
        active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
