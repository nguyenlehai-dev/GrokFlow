import type { FrontendModule, NavEntry, ModuleRoute } from "./types";

import { moduleManifest as admin } from "@/modules/admin";
import { moduleManifest as auth } from "@/modules/auth";
import { moduleManifest as landing } from "@/modules/landing";
import { moduleManifest as grok } from "@/modules/grok";
import { moduleManifest as flow } from "@/modules/flow";
import { moduleManifest as gateway } from "@/modules/gateway";

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

/** Flat list of sidebar entries from every authed module, in registration
 *  order. AppShell filters this further by user role + domain. */
export function getAuthedNav(): NavEntry[] {
  return MODULES.filter((m) => !PUBLIC_MODULES.has(m.name)).flatMap((m) => m.nav ?? []);
}
