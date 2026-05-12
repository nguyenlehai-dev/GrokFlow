import { Navigate } from "react-router-dom";
import {
  LayoutDashboard, Key, CreditCard, ScrollText, Shield, Settings,
  UserCog, Globe, Wrench, Rocket,
} from "lucide-react";

import { FEATURE_KEYS } from "@/core/entitlements/catalog";
import type { FrontendModule } from "@/app/types";

import { DashboardPage } from "./DashboardPage";
import { ApiKeysPage } from "./ApiKeysPage";
import { AuditLogPage } from "./AuditLogPage";
import { SettingsPage } from "./SettingsPage";
import { BillingPage } from "./BillingPage";
import { CheckoutPage } from "./CheckoutPage";
import { AdminUsersPage } from "./AdminUsersPage";
import { AdminRolesPage } from "./AdminRolesPage";
import { AdminPlansPage } from "./AdminPlansPage";
import { AdminBillingPage } from "./AdminBillingPage";
import { AdminDomainsPage } from "./AdminDomainsPage";
import { AdminGitPage } from "./AdminGitPage";
import { AdminPage } from "./AdminPage";

/** Admin & back-office module — everything authed but not a product:
 *    - Dashboard, API Keys, user-side Billing/Checkout, Audit Log, Settings
 *    - Admin tools (Users, Roles, Plans, Domains, Git, system Billing)
 *  Each admin sub-page is internally guarded by AdminGuard / domain scoping. */
export const moduleManifest: FrontendModule = {
  name: "admin",
  label: "Admin & Back-office",
  routes: [
    { path: "dashboard", element: <DashboardPage /> },
    { path: "api-keys", element: <ApiKeysPage /> },
    { path: "billing", element: <BillingPage /> },
    { path: "checkout/:plan_code", element: <CheckoutPage /> },
    { path: "audit-logs", element: <AuditLogPage /> },
    { path: "settings", element: <SettingsPage /> },
    // Admin sub-routes
    { path: "admin", element: <Navigate to="/admin/users" replace /> },
    { path: "admin/users", element: <AdminUsersPage /> },
    { path: "admin/roles", element: <AdminRolesPage /> },
    { path: "admin/plans", element: <AdminPlansPage /> },
    { path: "admin/billing", element: <AdminBillingPage /> },
    { path: "admin/domains", element: <AdminDomainsPage /> },
    { path: "admin/git", element: <AdminGitPage /> },
    { path: "admin/legacy", element: <AdminPage /> },
  ],
  nav: [
    // Top-level entries (above the auth group)
    { type: "link", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { type: "link", to: "/api-keys", label: "API Keys", icon: Key },
    { type: "link", to: "/billing", label: "Billing", icon: CreditCard },
    { type: "link", to: "/audit-logs", label: "Audit Log", icon: ScrollText, feature: FEATURE_KEYS.uiAuditLog, adminOnly: true },
    // Admin/auth group
    {
      type: "group",
      key: "auth",
      label: "Auth",
      icon: Shield,
      adminOnly: true,
      items: [
        { type: "link", to: "/settings", label: "Setting", icon: Settings, feature: FEATURE_KEYS.uiSettings, superOnly: true },
        { type: "link", to: "/admin/users", label: "Admin", icon: UserCog },
        { type: "link", to: "/admin/roles", label: "Roles", icon: Shield },
        { type: "link", to: "/admin/domains", label: "Domains", icon: Globe, superOnly: true },
        { type: "link", to: "/admin/billing", label: "Billing", icon: CreditCard, superOnly: true },
        { type: "link", to: "/admin/plans", label: "Plans / Gói", icon: Wrench, superOnly: true },
        { type: "link", to: "/admin/git", label: "Git / Deploy", icon: Rocket, superOnly: true },
      ],
    },
  ],
};
