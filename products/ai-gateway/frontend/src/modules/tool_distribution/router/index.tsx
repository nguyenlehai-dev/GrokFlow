import { Package, MonitorDown, Laptop, FileText } from "lucide-react";
import { Navigate } from "react-router-dom";

import type { FrontendModule } from "@/app/types";
import { lazyPage } from "@/app/lazyPage";

/** Tool Distribution module — super_admin manages downloadable installer
 *  files (`.exe` / `.dmg`) and documentation for distributable products
 *  (the desktop kiosk app, helper utilities, ...).
 *
 *  Sidebar lives under "Workspace" alongside Studio AI / Flow / Gateway.
 *  Three sibling pages share one component (parameterised by URL `:kind`):
 *
 *    /tools/win       — Windows installers (.exe / .msi)
 *    /tools/mac       — Mac installers (.dmg / .pkg)
 *    /tools/document  — PDFs / changelogs / user guides
 *
 *  Same backend endpoint serves all three — filter happens client-side
 *  in the page component so the list query is shared (one fetch, three
 *  views). The route key `tool_dist` is added to `WEB_GROUP_KEYS` in
 *  `moduleRegistry.ts` so super_admin sees this group folded inside the
 *  "Workspace" parent. */
export const moduleManifest: FrontendModule = {
  name: "tool_distribution",
  label: "Tool Distribution",
  routes: [
    // Bare /tools redirects to the Windows view as the default landing.
    { path: "tools", element: <Navigate to="/tools/win" replace /> },
    { path: "tools/:kind", element: lazyPage(
        () => import("../views/ToolsListPage"), "ToolsListPage") },
  ],
  nav: [
    {
      type: "group",
      key: "tool_dist",
      label: "Tool",
      icon: Package,
      superOnly: true,
      items: [
        { type: "link", to: "/tools/win",      label: "Windows",  icon: MonitorDown, superOnly: true },
        { type: "link", to: "/tools/mac",      label: "macOS",    icon: Laptop,      superOnly: true },
        { type: "link", to: "/tools/document", label: "Document", icon: FileText,    superOnly: true },
      ],
    },
  ],
};
