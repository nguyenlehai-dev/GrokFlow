import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { LoginPage } from "@/modules/auth/LoginPage";
import { DashboardPage } from "@/modules/dashboard/DashboardPage";
import { ApiKeysPage } from "@/modules/api-keys/ApiKeysPage";
import { ProfilesPage } from "@/modules/profiles/ProfilesPage";
import { JobsPage } from "@/modules/jobs/JobsPage";
import { ApiDocsPage } from "@/modules/api-docs/ApiDocsPage";
import { SettingsPage } from "@/modules/settings/SettingsPage";
import { AdminPage } from "@/modules/admin/AdminPage";
import { AuditLogPage } from "@/modules/audit/AuditLogPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
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
      { path: "audit-logs", element: <AuditLogPage /> },
      { path: "admin", element: <AdminPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
