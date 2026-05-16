import { Navigate } from "react-router-dom";
import {
  LayoutDashboard, Key, CreditCard, ScrollText, Shield, Settings,
  UserCog, Globe, Wrench, Rocket, Images, Film, MessageSquare,
  Wallet, BadgeDollarSign,
} from "lucide-react";

import { FEATURE_KEYS } from "@/core/entitlements/catalog";
import type { FrontendModule } from "@/app/types";
import { lazyPage } from "@/app/lazyPage";
import { DashboardSwitch } from "../components/DashboardSwitch";

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
    { path: "api-keys",    element: lazyPage(() => import("../views/ApiKeysPage"), "ApiKeysPage") },
    { path: "billing",     element: lazyPage(() => import("../views/BillingPage"), "BillingPage") },
    { path: "checkout/:plan_code", element: lazyPage(() => import("../views/CheckoutPage"), "CheckoutPage") },
    { path: "audit-logs",  element: lazyPage(() => import("../views/AuditLogPage"), "AuditLogPage") },
    { path: "settings",    element: lazyPage(() => import("../views/SettingsPage"), "SettingsPage") },
    // Gallery (super_admin sees everything, others scoped). Three views:
    //   /gallery/images   — image grid
    //   /gallery/videos   — video grid
    //   /gallery/prompts  — prompt-focused list
    // The legacy /gallery URL redirects to /gallery/images.
    { path: "gallery",          element: lazyPage(() => import("../views/GalleryPage"), "GalleryPage") },
    { path: "gallery/images",   element: lazyPage(() => import("../views/GalleryImagesPage"), "GalleryImagesPage") },
    { path: "gallery/videos",   element: lazyPage(() => import("../views/GalleryVideosPage"), "GalleryVideosPage") },
    { path: "gallery/prompts",  element: lazyPage(() => import("../views/GalleryPromptsPage"), "GalleryPromptsPage") },
    // Admin sub-routes
    { path: "admin",           element: <Navigate to="/admin/users" replace /> },
    { path: "admin/users",     element: lazyPage(() => import("../views/AdminUsersPage"), "AdminUsersPage") },
    { path: "admin/roles",     element: lazyPage(() => import("../views/AdminRolesPage"), "AdminRolesPage") },
    { path: "admin/plans",     element: lazyPage(() => import("../views/AdminPlansPage"), "AdminPlansPage") },
    { path: "admin/billing",   element: lazyPage(() => import("../views/AdminBillingPage"), "AdminBillingPage") },
    { path: "admin/domains",   element: lazyPage(() => import("../views/AdminDomainsPage"), "AdminDomainsPage") },
    { path: "admin/git",       element: lazyPage(() => import("../views/AdminGitPage"), "AdminGitPage") },
    { path: "admin/legacy",    element: lazyPage(() => import("../views/AdminPage"), "AdminPage") },
  ],
  nav: [
    // Top-level entries (above the auth group)
    { type: "link", to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { type: "link", to: "/api-keys", label: "API Keys", icon: Key },
    // User-side billing: "my plan & invoices". Renamed to disambiguate
    // from the super-admin Billing Manager that lives under Auth group.
    { type: "link", to: "/billing", label: "Gói của tôi", icon: Wallet },
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
    // Admin/auth group — users, roles, domains.
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
      ],
    },
    // Billing & monetisation (super_admin) — grouped so the user-side
    // "Gói của tôi" link above doesn't sit next to a confusingly-named
    // "Billing" peer. Sub-items:
    //   Plans / Gói       — define what packages users can buy
    //   Billing Manager   — all-tenant subscription / payment / invoice CRUD
    {
      type: "group",
      key: "billing-admin",
      label: "Billing",
      icon: BadgeDollarSign,
      superOnly: true,
      items: [
        { type: "link", to: "/admin/plans",   label: "Gói",     icon: Wrench,    superOnly: true },
        { type: "link", to: "/admin/billing", label: "Manager", icon: CreditCard, superOnly: true },
      ],
    },
    // Deploy ops — separate group since git/server actions are distinct
    // from billing or user management. Sits at the bottom of the sidebar.
    {
      type: "group",
      key: "ops",
      label: "Ops",
      icon: Rocket,
      superOnly: true,
      items: [
        { type: "link", to: "/admin/git", label: "Git / Deploy", icon: Rocket, superOnly: true },
      ],
    },
  ],
};
