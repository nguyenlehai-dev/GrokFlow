import { Globe } from "lucide-react";

import type { FrontendModule, NavEntry, NavGroup, ModuleRoute } from "./types";

import { moduleManifest as admin } from "@/modules/admin/router";
import { moduleManifest as auth } from "@/modules/auth/router";
import { moduleManifest as landing } from "@/modules/landing/router";
import { moduleManifest as gateway } from "@/modules/gateway/router";
import { moduleManifest as tool } from "@/modules/tool/router";
import { moduleManifest as toolDistribution } from "@/modules/tool_distribution/router";

/** ai-gateway standalone — Gateway + Tool surfaces, shared core. */
export const MODULES: FrontendModule[] = [
  admin,
  gateway,
  toolDistribution,
  tool,
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

const WEB_GROUP_KEYS = new Set(["gateway", "tool_dist"]);

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
