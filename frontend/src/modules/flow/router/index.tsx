import { Navigate } from "react-router-dom";
import { Video, FileText, Activity, Briefcase } from "lucide-react";

import type { FrontendModule } from "@/app/types";
import { TOOLS, TOOL_BY_SLUG } from "../configs/tools";
import { VideoToolPage } from "../views/VideoToolPage";
import { FlowApiDocsPage } from "../views/FlowApiDocsPage";
import { FlowRequestsPage } from "../views/FlowRequestsPage";
import { ApiKeyGuard } from "../components/ApiKeyGuard";

/** Flow video-tools module.
 *
 *  Sidebar layout (after the API-key gating):
 *
 *    Flow
 *    └─ Jobs                                 ← only navigable with ≥ 1 API key
 *       ├─ Cắt video, Ghép video, …          ← the 8 tool pages
 *       └─ Requests (REQ)
 *    └─ Flow API Docs                        ← always visible (read-only docs)
 *
 *  The Jobs items live in a nested NavGroup so they collapse together;
 *  Flow API Docs sits next to that group so a new user can read the docs
 *  before deciding to mint a key. The actual access gate is enforced
 *  client-side by `ApiKeyGuard` (HTTP equivalent guard is the X-API-Key
 *  header check on /api/v1/video/*). */
export const moduleManifest: FrontendModule = {
  name: "flow",
  label: "Quản lý Flow",
  apiBaseUrl: import.meta.env.VITE_MODULE_FLOW_API ?? "",
  routes: [
    { path: "flow", element: <Navigate to="/flow/cut" replace /> },
    ...TOOLS.map((t) => ({
      path: `flow/${t.slug}`,
      element: (
        <ApiKeyGuard workspaceLabel={t.shortLabel}>
          <VideoToolPage tool={TOOL_BY_SLUG[t.slug]} />
        </ApiKeyGuard>
      ),
    })),
    {
      path: "flow/requests",
      element: (
        <ApiKeyGuard workspaceLabel="Requests">
          <FlowRequestsPage />
        </ApiKeyGuard>
      ),
    },
    // Docs page intentionally NOT gated — pre-signup readers should browse.
    { path: "flow/docs", element: <FlowApiDocsPage /> },
  ],
  nav: [
    {
      type: "group",
      key: "flow",
      label: "Quản lý Flow",
      icon: Video,
      items: [
        {
          type: "group",
          key: "flow-jobs",
          label: "Jobs",
          icon: Briefcase,
          items: [
            ...TOOLS.map((t) => ({
              type: "link" as const,
              to: `/flow/${t.slug}`,
              label: t.label,
              icon: t.icon,
            })),
            {
              type: "link" as const,
              to: "/flow/requests",
              label: "Requests (REQ)",
              icon: Activity,
            },
          ],
        },
        {
          type: "link" as const,
          to: "/flow/docs",
          label: "Flow API Docs",
          icon: FileText,
        },
      ],
    },
  ],
};
