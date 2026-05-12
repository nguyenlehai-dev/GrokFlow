import { Navigate } from "react-router-dom";
import { Video, FileText } from "lucide-react";

import type { FrontendModule } from "@/app/types";
import { TOOLS, TOOL_BY_SLUG } from "./tools";
import { VideoToolPage } from "./components/VideoToolPage";
import { FlowApiDocsPage } from "./components/FlowApiDocsPage";

/** Flow video-tools module.
 *
 *  Every tool is rendered by the same `VideoToolPage` driven by `tools.ts`
 *  — adding a new tool is a one-line addition to TOOLS, not a new React
 *  page. Same-origin API by default; override with VITE_MODULE_FLOW_API
 *  when the proxy is hosted out-of-process. */
export const moduleManifest: FrontendModule = {
  name: "flow",
  label: "Quản lý Flow",
  apiBaseUrl: import.meta.env.VITE_MODULE_FLOW_API ?? "",
  routes: [
    { path: "flow", element: <Navigate to="/flow/cut" replace /> },
    ...TOOLS.map((t) => ({
      path: `flow/${t.slug}`,
      element: <VideoToolPage tool={TOOL_BY_SLUG[t.slug]} />,
    })),
    { path: "flow/docs", element: <FlowApiDocsPage /> },
  ],
  nav: [
    {
      type: "group",
      key: "flow",
      label: "Quản lý Flow",
      icon: Video,
      items: [
        ...TOOLS.map((t) => ({
          type: "link" as const,
          to: `/flow/${t.slug}`,
          label: t.label,
          icon: t.icon,
        })),
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
