import { Server, List } from "lucide-react";

import type { FrontendModule } from "@/app/types";
import { lazyPage } from "@/app/lazyPage";

/** Server management module — super_admin only.
 *
 *  Server rows describe global infrastructure (the VPS host running the
 *  whole stack), so domain admins should not see Start/Stop/Reboot
 *  controls for boxes they don't own. Backend `/api/admin/servers/*`
 *  uses the `SuperAdminUser` dep — the FE nav `superOnly` flag keeps
 *  the menu in sync, otherwise a domain admin would see the menu but
 *  every API call would 403.
 */
export const moduleManifest: FrontendModule = {
  name: "servers",
  label: "Server Management",
  routes: [
    { path: "servers",       element: lazyPage(() => import("../views/ServersListPage"), "ServersListPage") },
    { path: "servers/:id",   element: lazyPage(() => import("../views/ServerDetailPage"), "ServerDetailPage") },
  ],
  nav: [
    {
      type: "group",
      key: "servers",
      label: "Quản lý Server",
      icon: Server,
      superOnly: true,
      items: [
        { type: "link", to: "/servers", label: "Danh sách Server", icon: List, superOnly: true },
      ],
    },
  ],
};
