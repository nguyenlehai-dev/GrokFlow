import { Navigate } from "react-router-dom";
import {
  Network, LayoutDashboard, Key, Activity, Layers, GitBranch, Code2,
  Terminal, BookOpen,
} from "lucide-react";

import type { FrontendModule } from "@/app/types";

import { GatewayDashboardPage } from "./GatewayDashboardPage";
import { GatewayVendorsPage } from "./GatewayVendorsPage";
import { GatewayPoolsPage } from "./GatewayPoolsPage";
import { GatewayFunctionsPage } from "./GatewayFunctionsPage";
import { GatewayKeysPage } from "./GatewayKeysPage";
import { GatewayRequestsPage } from "./GatewayRequestsPage";
import { GatewayPlaygroundPage } from "./GatewayPlaygroundPage";
import { GatewayDocsPage } from "./GatewayDocsPage";

/** LLM Gateway module. Multi-tenant: domain admins see their tenant's
 *  Dashboard / Keys / Requests; super_admin manages global Vendors / Pools
 *  / Functions; non-admin users on a granted domain just see Playground +
 *  API Docs (and verify a gwk_live_* key to use the playground).
 *
 *  apiBaseUrl points the gateway's axios at a different host if the gateway
 *  is split into its own service later. */
export const moduleManifest: FrontendModule = {
  name: "gateway",
  label: "Gateway Management",
  apiBaseUrl: import.meta.env.VITE_MODULE_GATEWAY_API ?? "",
  routes: [
    { path: "gateway", element: <Navigate to="/gateway/dashboard" replace /> },
    { path: "gateway/dashboard", element: <GatewayDashboardPage /> },
    { path: "gateway/vendors", element: <GatewayVendorsPage /> },
    { path: "gateway/pools", element: <GatewayPoolsPage /> },
    { path: "gateway/functions", element: <GatewayFunctionsPage /> },
    { path: "gateway/gateway-keys", element: <GatewayKeysPage /> },
    { path: "gateway/requests", element: <GatewayRequestsPage /> },
    { path: "gateway/playground", element: <GatewayPlaygroundPage /> },
    { path: "gateway/docs", element: <GatewayDocsPage /> },
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
