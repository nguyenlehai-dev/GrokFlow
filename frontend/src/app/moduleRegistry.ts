import { Globe } from "lucide-react";

import type { FrontendModule, NavEntry, NavGroup, ModuleRoute } from "./types";

import { moduleManifest as admin } from "@/modules/admin/router";
import { moduleManifest as auth } from "@/modules/auth/router";
import { moduleManifest as landing } from "@/modules/landing/router";
import { moduleManifest as grok } from "@/modules/grok/router";
import { moduleManifest as flow } from "@/modules/flow/router";
import { moduleManifest as gateway } from "@/modules/gateway/router";
import { moduleManifest as servers } from "@/modules/servers/router";

/** The single source of truth for which modules are loaded into the app.
 *
 *  Order here controls:
 *    - The order of sidebar groups (top → bottom)
 *    - The order routes are registered (any conflicts → first one wins)
 *
 *  To add a new module:
 *    1. Drop its folder under `modules/<name>/` with an `index.tsx` that
 *       exports `moduleManifest: FrontendModule`.
 *    2. Import + add it to MODULES below.
 *    3. (Optional) If its BE lives in a separate repo, set
 *       VITE_MODULE_<NAME>_API in the build env.
 *
 *  Auth and landing modules are mounted as PUBLIC routes (no auth gate).
 *  Everything else is mounted inside the authed ProtectedRoute shell —
 *  see app/router.tsx for the split. */
export const MODULES: FrontendModule[] = [
  admin,    // Dashboard / ApiKeys / Billing / AuditLog / Settings / Admin tools
  grok,     // Profiles / Jobs / API Docs
  flow,     // Video tools
  gateway,  // LLM Gateway
  servers,  // VPS management (super_admin)
  // Public (mounted outside the auth shell)
  auth,
  landing,
];

/** Module names that are mounted PUBLIC (above the ProtectedRoute). */
export const PUBLIC_MODULES = new Set(["auth", "landing"]);

export function getAuthedRoutes(): ModuleRoute[] {
  return MODULES.filter((m) => !PUBLIC_MODULES.has(m.name)).flatMap((m) => m.routes);
}

export function getPublicRoutes(): ModuleRoute[] {
  return MODULES.filter((m) => PUBLIC_MODULES.has(m.name)).flatMap((m) => m.routes);
}

/** Sidebar nav from every authed module.
 *
 *  For super_admin the three product groups (Grok / Flow / Gateway, plus
 *  any future tools that opt in via `WEB_GROUP_KEYS`) get folded under a
 *  single top-level "Web" parent so the sidebar stays scannable as more
 *  modules ship. Other roles see the flat module-order list as before —
 *  they typically only have access to one or two of those groups anyway,
 *  so an extra wrapping click adds friction without payoff.
 *
 *  Adding a new module to the "Web" bucket: extend WEB_GROUP_KEYS with the
 *  module's NavGroup key. No changes needed in the module itself. */
const WEB_GROUP_KEYS = new Set(["grok", "flow", "gateway"]);

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
