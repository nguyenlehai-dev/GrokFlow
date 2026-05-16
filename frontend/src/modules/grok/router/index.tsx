import { Sparkles, Layers, Workflow, FileText, Activity } from "lucide-react";

import { FEATURE_KEYS } from "@/core/entitlements/catalog";
import type { FrontendModule } from "@/app/types";
import { lazyPage } from "@/app/lazyPage";
import { KeyGate } from "../components/KeyGate";

/** Grok automation module — Profiles (browser sessions), Jobs (image/video
 *  generation), API Docs for the public Grok API, plus a Playground that
 *  gates job submission behind API-key verification (mirrors the Gateway
 *  Playground UX so operators have one mental model across modules).
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
    { path: "profiles",       element: lazyPage(() => import("../views/ProfilesPage"), "ProfilesPage") },
    // /jobs is customer-facing job history — same lock as Playground so
    // non-admin viewers must verify a Grok API key before seeing job rows.
    // Admins bypass; domains with require_playground_key=false bypass.
    { path: "jobs",           element: <KeyGate>{lazyPage(() => import("../views/JobsPage"), "JobsPage")}</KeyGate> },
    { path: "grok/playground", element: lazyPage(() => import("../views/GrokPlaygroundPage"), "GrokPlaygroundPage") },
    { path: "api-docs",       element: lazyPage(() => import("../views/ApiDocsPage"), "ApiDocsPage") },
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
        // Playground sits between Jobs (where async results land) and
        // API Docs (reference). Same Activity icon as Flow Requests +
        // Gateway Requests so the "REQ-style entrypoint" pattern is
        // consistent across modules.
        { type: "link", to: "/grok/playground", label: "Playground", icon: Activity },
        { type: "link", to: "/api-docs", label: "API Docs", icon: FileText, feature: FEATURE_KEYS.uiApiDocs },
      ],
    },
  ],
};
