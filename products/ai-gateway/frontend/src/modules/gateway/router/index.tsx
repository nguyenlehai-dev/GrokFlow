import { Navigate } from "react-router-dom";
import {
  Network, LayoutDashboard, Key, Activity, Layers, GitBranch, Code2,
  Terminal, BookOpen,
} from "lucide-react";

import type { FrontendModule } from "@/app/types";
import { lazyPage } from "@/app/lazyPage";

/** LLM Gateway module. Multi-tenant: domain admins see their tenant's
 *  Dashboard / Keys / Requests; super_admin manages global Vendors / Pools
 *  / Functions; non-admin users on a granted domain just see Playground +
 *  API Docs (and verify a gwk_live_* key to use the playground).
 *
 *  All pages are lazy-loaded — each path triggers its own Vite chunk so
 *  the initial bundle stays small. Set apiBaseUrl via env to route the
 *  gateway axios at a different host later. */
export const moduleManifest: FrontendModule = {
  name: "gateway",
  label: "Gateway Management",
  apiBaseUrl: import.meta.env.VITE_MODULE_GATEWAY_API ?? "",
  routes: [
    { path: "gateway", element: <Navigate to="/gateway/dashboard" replace /> },
    { path: "gateway/dashboard",     element: lazyPage(() => import("../views/GatewayDashboardPage"), "GatewayDashboardPage") },
    { path: "gateway/vendors",       element: lazyPage(() => import("../views/GatewayVendorsPage"), "GatewayVendorsPage") },
    { path: "gateway/pools",         element: lazyPage(() => import("../views/GatewayPoolsPage"), "GatewayPoolsPage") },
    { path: "gateway/functions",     element: lazyPage(() => import("../views/GatewayFunctionsPage"), "GatewayFunctionsPage") },
    { path: "gateway/gateway-keys",  element: lazyPage(() => import("../views/GatewayKeysPage"), "GatewayKeysPage") },
    { path: "gateway/requests",      element: lazyPage(() => import("../views/GatewayRequestsPage"), "GatewayRequestsPage") },
    { path: "gateway/playground",    element: lazyPage(() => import("../views/GatewayPlaygroundPage"), "GatewayPlaygroundPage") },
    { path: "gateway/docs",          element: lazyPage(() => import("../views/GatewayDocsPage"), "GatewayDocsPage") },
  ],
  nav: [
    {
      type: "group",
      key: "gateway",
      label: "Gateway Management",
      icon: Network,
      items: [
        // Per-tenant admin pages — backend filters by domain_id.
        { type: "link", to: "/gateway/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
        { type: "link", to: "/gateway/gateway-keys", label: "Gateway Keys", icon: Key, adminOnly: true },
        { type: "link", to: "/gateway/requests", label: "Requests", icon: Activity, adminOnly: true },
        // Global provider config — read-only for per-domain admin, full CRUD for super.
        { type: "link", to: "/gateway/vendors", label: "Vendors", icon: Layers, adminOnly: true },
        { type: "link", to: "/gateway/pools", label: "Pools", icon: GitBranch, adminOnly: true },
        { type: "link", to: "/gateway/functions", label: "API Functions", icon: Code2, adminOnly: true },
        // Open to non-admin tenant users (subject to domain.allowed_pages).
        { type: "link", to: "/gateway/playground", label: "Playground", icon: Terminal },
        { type: "link", to: "/gateway/docs", label: "API Docs", icon: BookOpen },
      ],
    },
  ],
};
