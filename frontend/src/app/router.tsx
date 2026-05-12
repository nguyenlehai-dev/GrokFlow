import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { PublicRouteGuard } from "@/components/layout/PublicRouteGuard";
import { ComingSoonPage } from "@/components/ui/ComingSoonPage";
import { LoginPage } from "@/modules/auth/LoginPage";
import { RegisterPage } from "@/modules/auth/RegisterPage";
import { LandingPage } from "@/modules/landing/LandingPage";
import { BillingPage } from "@/modules/billing/BillingPage";
import { PricingPage } from "@/modules/billing/PricingPage";
import { CheckoutPage } from "@/modules/billing/CheckoutPage";
import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { ApiKeysPage } from "@/modules/api-keys/ApiKeysPage";
import { ProfilesPage } from "@/modules/profiles/ProfilesPage";
import { JobsPage } from "@/modules/jobs/JobsPage";
import { ApiDocsPage } from "@/modules/api-docs/ApiDocsPage";
import { SettingsPage } from "@/modules/settings/SettingsPage";
import { AdminPage } from "@/modules/admin/AdminPage";
import { AdminUsersPage } from "@/modules/admin/AdminUsersPage";
import { AdminPlansPage } from "@/modules/admin/AdminPlansPage";
import { AdminBillingPage } from "@/modules/admin/AdminBillingPage";
import { AdminDomainsPage } from "@/modules/admin/AdminDomainsPage";
import { AdminGitPage } from "@/modules/admin/AdminGitPage";
import { AuditLogPage } from "@/modules/audit/AuditLogPage";
import { GatewayOverviewPage } from "@/modules/gateway/GatewayOverviewPage";
import { GatewayProfilesPage } from "@/modules/gateway/GatewayProfilesPage";
import { GatewayProxiesPage } from "@/modules/gateway/GatewayProxiesPage";
import { GatewayApiKeysPage } from "@/modules/gateway/GatewayApiKeysPage";
import { GatewayJobsPage } from "@/modules/gateway/GatewayJobsPage";
import { GatewaySettingsPage } from "@/modules/gateway/GatewaySettingsPage";
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

      // Gateway Management — all 7 sub-routes wired to gatewaygrok-backend
      { path: "gateway", element: <Navigate to="/gateway/overview" replace /> },
      { path: "gateway/overview",   element: <GatewayOverviewPage /> },
      { path: "gateway/profiles",   element: <GatewayProfilesPage /> },
      { path: "gateway/proxies",    element: <GatewayProxiesPage /> },
      { path: "gateway/api-keys",   element: <GatewayApiKeysPage /> },
      { path: "gateway/jobs",       element: <GatewayJobsPage /> },
      { path: "gateway/settings",   element: <GatewaySettingsPage /> },
      { path: "gateway/playground", element: <GatewayPlaygroundPage /> },
      { path: "gateway/docs",       element: <GatewayDocsPage /> },
    ],
  },
]);
