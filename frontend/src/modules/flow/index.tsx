import { Navigate } from "react-router-dom";
import {
  Video, Scissors, Combine, AudioLines, Replace, Gauge, Maximize2, Crop, Film,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ComingSoonPage } from "@/components/ui/ComingSoonPage";
import type { FrontendModule } from "@/app/types";

/** All Flow tool slugs in one place. When real implementations land they
 *  swap the ComingSoonPage element below for the real page component. */
const TOOLS: { slug: string; label: string; icon: LucideIcon }[] = [
  { slug: "cut",            label: "Cut Video",            icon: Scissors },
  { slug: "merge",          label: "Merge Videos",         icon: Combine },
  { slug: "extract-audio",  label: "Extract Audio",        icon: AudioLines },
  { slug: "replace-audio",  label: "Merge / Replace Audio", icon: Replace },
  { slug: "change-speed",   label: "Change Speed",         icon: Gauge },
  { slug: "resize",         label: "Resize",               icon: Maximize2 },
  { slug: "crop",           label: "Crop Video",           icon: Crop },
  { slug: "extract-frames", label: "Extract Frames",       icon: Film },
  { slug: "docs",           label: "Flow API Docs",        icon: FileText },
];

/** Flow video tools module. Pages are placeholders today; ready to slot in
 *  the real BE implementations one by one. Set VITE_MODULE_FLOW_API to
 *  route the module's axios at a remote Flow service. */
export const moduleManifest: FrontendModule = {
  name: "flow",
  label: "Quản lý Flow",
  apiBaseUrl: import.meta.env.VITE_MODULE_FLOW_API ?? "",
  routes: [
    { path: "flow", element: <Navigate to="/flow/cut" replace /> },
    ...TOOLS.map((t) => ({
      path: `flow/${t.slug}`,
      element: <ComingSoonPage title={`Flow — ${t.label}`} />,
    })),
  ],
  nav: [
    {
      type: "group",
      key: "flow",
      label: "Quản lý Flow",
      icon: Video,
      items: TOOLS.map((t) => ({
        type: "link" as const,
        to: `/flow/${t.slug}`,
        label: t.label,
        icon: t.icon,
      })),
    },
  ],
};
