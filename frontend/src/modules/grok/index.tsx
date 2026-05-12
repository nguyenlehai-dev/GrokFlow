import { Sparkles, Layers, Workflow, FileText } from "lucide-react";

import { FEATURE_KEYS } from "@/core/entitlements/catalog";
import type { FrontendModule } from "@/app/types";

import { ProfilesPage } from "./ProfilesPage";
import { JobsPage } from "./JobsPage";
import { ApiDocsPage } from "./ApiDocsPage";

/** Grok automation module — Profiles (browser sessions), Jobs (image/video
 *  generation), and API Docs for the public Grok API.
 *
 *  Future: when the Grok backend lives in its own repo, set
 *  VITE_MODULE_GROK_API=https://grok-api.example.com and the module's
 *  axios instance will route there. For now `apiBaseUrl=""` keeps the
 *  same-origin behavior (FastAPI in this monorepo). */
export const moduleManifest: FrontendModule = {
  name: "grok",
  label: "Quản lý Grok",
  apiBaseUrl: import.meta.env.VITE_MODULE_GROK_API ?? "",
  routes: [
    { path: "profiles", element: <ProfilesPage /> },
    { path: "jobs", element: <JobsPage /> },
    { path: "api-docs", element: <ApiDocsPage /> },
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
