import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { PublicRouteGuard } from "@/components/layout/PublicRouteGuard";
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
import { AuditLogPage } from "@/modules/audit/AuditLogPage";

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
    path: "/app",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
    ],
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
      { path: "admin", element: <AdminPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
