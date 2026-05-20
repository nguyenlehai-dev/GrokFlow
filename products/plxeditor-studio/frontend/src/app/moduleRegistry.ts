import { Globe } from "lucide-react";

import type { FrontendModule, NavEntry, NavGroup, ModuleRoute } from "./types";

import { moduleManifest as admin } from "@/modules/admin/router";
import { moduleManifest as auth } from "@/modules/auth/router";
import { moduleManifest as landing } from "@/modules/landing/router";
import { moduleManifest as grok } from "@/modules/grok/router";
import { moduleManifest as flow } from "@/modules/flow/router";

/** plxeditor-studio standalone module list. Branded all-in-one
 *  editor — Grok image/video + Flow video post-processing share a
 *  single admin shell. Gateway / Tool distribution / Servers
 *  stripped — those workflows live in ai-gateway. */
export const MODULES: FrontendModule[] = [
  admin,    // Dashboard / ApiKeys / Billing / AuditLog / Settings / Gallery
  grok,     // Profiles / Jobs / API Docs (Grok product)
  flow,     // Video tools (cut / merge / audio / frames / ...)
  // Public (mounted outside the auth shell)
  auth,
  landing,
];

export const PUBLIC_MODULES = new Set(["auth", "landing"]);

export function getAuthedRoutes(): ModuleRoute[] {
  return MODULES.filter((m) => !PUBLIC_MODULES.has(m.name)).flatMap((m) => m.routes);
}

export function getPublicRoutes(): ModuleRoute[] {
  return MODULES.filter((m) => PUBLIC_MODULES.has(m.name)).flatMap((m) => m.routes);
}

const WEB_GROUP_KEYS = new Set(["grok", "flow"]);

export function getAuthedNav(role: string | undefined | null = null): NavEntry[] {
  const flat = MODULES
    .filter((m) => !PUBLIC_MODULES.has(m.name))
    .flatMap((m) => m.nav ?? []);

  if (role !== "super_admin") return flat;

  const webChildren: NavEntry[] = [];
  const rest: NavEntry[] = [];
  for (const entry of flat) {
    if (entry.type === "group" && WEB_GROUP_KEYS.has(entry.key)) {
      webChildren.push(entry);
    } else {
      rest.push(entry);
    }
  }
  if (webChildren.length === 0) return flat;

  const webParent: NavGroup = {
    type: "group",
    key: "web",
    label: "Web",
    icon: Globe,
    superOnly: true,
    items: webChildren,
  };
  return [...rest, webParent];
}
