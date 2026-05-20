import { Navigate } from "react-router-dom";

import type { FrontendModule } from "@/app/types";
import { lazyPage } from "@/app/lazyPage";

/** "Tool" module — keeps the routes mounted so existing URLs (e.g.
 *  /tool/admin/customers, /tool/chat) still resolve when reached via
 *  deep-link or programmatic nav. The two sidebar nav groups (VIP TOOL +
 *  Quản lý Tool) were removed: provisioning now lives under Auth →
 *  Tool Installs, keyed by tool_id (per-machine), not per-user. */
export const moduleManifest: FrontendModule = {
  name: "tool",
  label: "Tool",
  routes: [
    { path: "tool",                element: <Navigate to="/tool/dashboard" replace /> },
    { path: "tool/dashboard",      element: lazyPage(() => import("../views/ToolDashboardPage"), "ToolDashboardPage") },
    { path: "tool/chat",           element: lazyPage(() => import("../views/ToolChatPage"), "ToolChatPage") },
    { path: "tool/video",          element: lazyPage(() => import("../views/ToolVideoPage"), "ToolVideoPage") },
    { path: "tool/image",          element: lazyPage(() => import("../views/ToolImagePage"), "ToolImagePage") },
    { path: "tool/history",        element: lazyPage(() => import("../views/ToolHistoryPage"), "ToolHistoryPage") },
    { path: "tool/prompts",        element: lazyPage(() => import("../views/ToolPromptsPage"), "ToolPromptsPage") },
    { path: "tool/ai-tools",       element: lazyPage(() => import("../views/ToolAIToolsPage"), "ToolAIToolsPage") },
    { path: "tool/settings",       element: lazyPage(() => import("../views/ToolSettingsPage"), "ToolSettingsPage") },
    { path: "tool/admin",                element: <Navigate to="/tool/admin/stats" replace /> },
    { path: "tool/admin/stats",          element: lazyPage(() => import("../views/ToolAdminStatsPage"), "ToolAdminStatsPage") },
    { path: "tool/admin/customers",      element: lazyPage(() => import("../views/ToolAdminCustomersPage"), "ToolAdminCustomersPage") },
    { path: "tool/admin/prompts",        element: lazyPage(() => import("../views/ToolAdminPromptsPage"), "ToolAdminPromptsPage") },
    { path: "tool/admin/chat-sessions",  element: lazyPage(() => import("../views/ToolAdminChatSessionsPage"), "ToolAdminChatSessionsPage") },
  ],
  nav: [],
};
