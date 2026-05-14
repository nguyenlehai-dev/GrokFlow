import { Navigate } from "react-router-dom";
import {
  LayoutDashboard, Key, CreditCard, ScrollText, Shield, Settings,
  UserCog, Globe, Wrench, Rocket, Images, Film, MessageSquare,
} from "lucide-react";

import { FEATURE_KEYS } from "@/core/entitlements/catalog";
import type { FrontendModule } from "@/app/types";
import { lazyPage } from "@/app/lazyPage";
import { DashboardSwitch } from "./DashboardSwitch";

/** Admin & back-office module — everything authed but not a product:
 *    - Dashboard, API Keys, user-side Billing/Checkout, Audit Log, Settings
 *    - Admin tools (Users, Roles, Plans, Domains, Git, system Billing)
 *  Each admin sub-page is internally guarded by AdminGuard / domain scoping.
 *  All pages lazy-loaded — initial bundle stays small even though this
 *  module has ~14 routes. */
export const moduleManifest: FrontendModule = {
  name: "admin",
  label: "Admin & Back-office",
  routes: [
    // DashboardSwitch picks SystemDashboard for super_admin, TenantDashboard
    // for everyone else. Each variant lazy-loads independently.
    { path: "dashboard",   element: <DashboardSwitch /> },
    { path: "api-keys",    element: lazyPage(() => import("./ApiKeysPage"), "ApiKeysPage") },
    { path: "billing",     element: lazyPage(() => import("./BillingPage"), "BillingPage") },
    { path: "checkout/:plan_code", element: lazyPage(() => import("./CheckoutPage"), "CheckoutPage") },
    { path: "audit-logs",  element: lazyPage(() => import("./AuditLogPage"), "AuditLogPage") },
    { path: "settings",    element: lazyPage(() => import("./SettingsPage"), "SettingsPage") },
    // Gallery (super_admin sees everything, others scoped). Three views:
    //   /gallery/images   — image grid
    //   /gallery/videos   — video grid
    //   /gallery/prompts  — prompt-focused list
    // The legacy /gallery URL redirects to /gallery/images.
    { path: "gallery",          element: lazyPage(() => import("./GalleryPage"), "GalleryPage") },
    { path: "gallery/images",   element: lazyPage(() => import("./GalleryImagesPage"), "GalleryImagesPage") },
    { path: "gallery/videos",   element: lazyPage(() => import("./GalleryVideosPage"), "GalleryVideosPage") },
    { path: "gallery/prompts",  element: lazyPage(() => import("./GalleryPromptsPage"), "GalleryPromptsPage") },
    // Admin sub-routes
    { path: "admin",           element: <Navigate to="/admin/users" replace /> },
    { path: "admin/users",     element: lazyPage(() => import("./AdminUsersPage"), "AdminUsersPage") },
    { path: "admin/roles",     element: lazyPage(() => import("./AdminRolesPage"), "AdminRolesPage") },
    { path: "admin/plans",     element: lazyPage(() => import("./AdminPlansPage"), "AdminPlansPage") },
    { path: "admin/billing",   element: lazyPage(() => import("./AdminBillingPage"), "AdminBillingPage") },
    { path: "admin/domains",   element: lazyPage(() => import("./AdminDomainsPage"), "AdminDomainsPage") },
    { path: "admin/git",       element: lazyPage(() => import("./AdminGitPage"), "AdminGitPage") },
    { path: "admin/legacy",    element: lazyPage(() => import("./AdminPage"), "AdminPage") },
  ],
  nav: [
    // Top-level entries (above the auth group)
    { type: "link", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { type: "link", to: "/api-keys", label: "API Keys", icon: Key },
    { type: "link", to: "/billing", label: "Billing", icon: CreditCard },
    { type: "link", to: "/audit-logs", label: "Audit Log", icon: ScrollText, feature: FEATURE_KEYS.uiAuditLog, adminOnly: true },
    // Gallery — admin scope. Three sub-views: image grid, video grid,
    // prompt-focused list. Super_admin can filter cross-domain.
    {
      type: "group",
      key: "gallery",
      label: "Gallery",
      icon: Images,
      adminOnly: true,
      items: [
        { type: "link", to: "/gallery/images",  label: "Ảnh", icon: Images },
        { type: "link", to: "/gallery/videos",  label: "Video", icon: Film },
        { type: "link", to: "/gallery/prompts", label: "Prompts", icon: MessageSquare },
      ],
    },
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
