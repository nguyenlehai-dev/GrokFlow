import { Sparkles, Layers, Workflow, FileText } from "lucide-react";

import { FEATURE_KEYS } from "@/core/entitlements/catalog";
import type { FrontendModule } from "@/app/types";
import { lazyPage } from "@/app/lazyPage";

/** Grok automation module — Profiles (browser sessions), Jobs (image/video
 *  generation), and API Docs for the public Grok API.
 *
 *  All pages lazy-loaded so initial bundle stays small. Future: when the
 *  Grok backend lives in its own repo, set VITE_MODULE_GROK_API and the
 *  module's axios instance (built via core/api/factory.createHttp) routes
 *  there. */
export const moduleManifest: FrontendModule = {
  name: "grok",
  label: "Quản lý Grok",
  apiBaseUrl: import.meta.env.VITE_MODULE_GROK_API ?? "",
  routes: [
    { path: "profiles", element: lazyPage(() => import("./ProfilesPage"), "ProfilesPage") },
    { path: "jobs",     element: lazyPage(() => import("./JobsPage"), "JobsPage") },
    { path: "api-docs", element: lazyPage(() => import("./ApiDocsPage"), "ApiDocsPage") },
  ],
  nav: [
    {
      type: "group",
      key: "grok",
      label: "Quản lý Grok",
      icon: Sparkles,
      items: [
        { type: "link", to: "/profiles", label: "Profiles", icon: Layers },
        { type: "link", to: "/jobs", label: "Jobs", icon: Workflow },
        { type: "link", to: "/api-docs", label: "API Docs", icon: FileText, feature: FEATURE_KEYS.uiApiDocs },
      ],
    },
  ],
};
