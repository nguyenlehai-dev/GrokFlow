import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { PublicRouteGuard } from "@/components/layout/PublicRouteGuard";
import { ComingSoonPage } from "@/components/ui/ComingSoonPage";
import { LoginPage } from "@/modules/auth/LoginPage";
import { RegisterPage } from "@/modules/auth/RegisterPage";
import { LandingPage } from "@/modules/landing/LandingPage";
import { BillingPage } from "@/modules/admin/BillingPage";
import { PricingPage } from "@/modules/landing/PricingPage";
import { CheckoutPage } from "@/modules/admin/CheckoutPage";
import { DashboardPage } from "@/modules/admin/DashboardPage";
import { ApiKeysPage } from "@/modules/admin/ApiKeysPage";
import { ProfilesPage } from "@/modules/grok/ProfilesPage";
import { JobsPage } from "@/modules/grok/JobsPage";
import { ApiDocsPage } from "@/modules/grok/ApiDocsPage";
import { SettingsPage } from "@/modules/admin/SettingsPage";
import { AdminPage } from "@/modules/admin/AdminPage";
import { AdminUsersPage } from "@/modules/admin/AdminUsersPage";
import { AdminRolesPage } from "@/modules/admin/AdminRolesPage";
import { AdminPlansPage } from "@/modules/admin/AdminPlansPage";
import { AdminBillingPage } from "@/modules/admin/AdminBillingPage";
import { AdminDomainsPage } from "@/modules/admin/AdminDomainsPage";
import { AdminGitPage } from "@/modules/admin/AdminGitPage";
import { AuditLogPage } from "@/modules/admin/AuditLogPage";
import { GatewayDashboardPage } from "@/modules/gateway/GatewayDashboardPage";
import { GatewayVendorsPage } from "@/modules/gateway/GatewayVendorsPage";
import { GatewayPoolsPage } from "@/modules/gateway/GatewayPoolsPage";
import { GatewayFunctionsPage } from "@/modules/gateway/GatewayFunctionsPage";
import { GatewayRequestsPage } from "@/modules/gateway/GatewayRequestsPage";
import { GatewayKeysPage } from "@/modules/gateway/GatewayKeysPage";
import { GatewayPlaygroundPage } from "@/modules/gateway/GatewayPlaygroundPage";
import { GatewayDocsPage } from "@/modules/gateway/GatewayDocsPage";

// Quản lý Flow — sub-pages, placeholders for now
const flowRoutes = [
  ["cut",             "Cut Video"],
  ["merge",           "Merge Videos"],
  ["extract-audio",   "Extract Audio"],
  ["replace-audio",   "Merge / Replace Audio"],
  ["change-speed",    "Change Speed"],
  ["resize",          "Resize"],
  ["crop",            "Crop Video"],
  ["extract-frames",  "Extract Frames"],
  ["docs",            "Flow API Docs"],
] as const;

// Gateway Management — all 7 pages wired to gatewaygrok-backend
// via the /gateway-api/* nginx proxy. No more placeholders.

export const router = createBrowserRouter([
  {
    path: "/landing",
    element: <PublicRouteGuard flag="allow_landing"><LandingPage /></PublicRouteGuard>,
  },
  {
    path: "/login",
    element: <PublicRouteGuard flag="allow_login"><LoginPage /></PublicRouteGuard>,
  },
  {
    path: "/register",
    element: <PublicRouteGuard flag="allow_register" fallback="/login"><RegisterPage /></PublicRouteGuard>,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "api-keys", element: <ApiKeysPage /> },
      { path: "profiles", element: <ProfilesPage /> },
      { path: "jobs", element: <JobsPage /> },
      { path: "api-docs", element: <ApiDocsPage /> },
      { path: "billing", element: <BillingPage /> },
      { path: "pricing", element: <PricingPage /> },
      { path: "checkout/:plan_code", element: <CheckoutPage /> },
      { path: "audit-logs", element: <AuditLogPage /> },
      { path: "settings", element: <SettingsPage /> },

      // Admin sub-routes (each is admin-guarded internally)
      { path: "admin", element: <Navigate to="/admin/users" replace /> },
      { path: "admin/users", element: <AdminUsersPage /> },
      { path: "admin/roles", element: <AdminRolesPage /> },
      { path: "admin/plans", element: <AdminPlansPage /> },
      { path: "admin/billing", element: <AdminBillingPage /> },
      { path: "admin/domains", element: <AdminDomainsPage /> },
      { path: "admin/git", element: <AdminGitPage /> },
      // Legacy combined view kept reachable for now (e.g. old bookmarks).
      { path: "admin/legacy", element: <AdminPage /> },

      // Quản lý Flow placeholders
      { path: "flow", element: <Navigate to="/flow/cut" replace /> },
      ...flowRoutes.map(([slug, label]) => ({
        path: `flow/${slug}`,
        element: <ComingSoonPage title={`Flow — ${label}`} />,
      })),

      // Gateway Management — LLM gateway (Vendors / Pools / Functions / Requests)
      { path: "gateway", element: <Navigate to="/gateway/dashboard" replace /> },
      { path: "gateway/dashboard",  element: <GatewayDashboardPage /> },
      { path: "gateway/vendors",    element: <GatewayVendorsPage /> },
      { path: "gateway/pools",      element: <GatewayPoolsPage /> },
      { path: "gateway/functions",  element: <GatewayFunctionsPage /> },
      { path: "gateway/gateway-keys", element: <GatewayKeysPage /> },
      { path: "gateway/requests",   element: <GatewayRequestsPage /> },
      { path: "gateway/playground", element: <GatewayPlaygroundPage /> },
      { path: "gateway/docs",       element: <GatewayDocsPage /> },
    ],
  },
]);
