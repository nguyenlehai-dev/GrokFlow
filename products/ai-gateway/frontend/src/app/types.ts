import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** A leaf entry in the sidebar (a single page link). */
export interface NavLeaf {
  type: "link";
  /** Absolute path WITHOUT leading slash relative-form quirks — e.g. "/jobs".
   *  Must match the route's mounted path. */
  to: string;
  label: string;
  icon: LucideIcon;
  /** Optional plan-entitlement gate key. Admins bypass.
   *  See `FEATURE_KEYS` in core/entitlements. */
  feature?: string;
  /** Visible only to role tier admin OR super_admin. */
  adminOnly?: boolean;
  /** Visible only to super_admin. */
  superOnly?: boolean;
}

/** A collapsible group of links in the sidebar.
 *
 *  `items` is recursive — a group can hold leaves OR sub-groups — so we can
 *  build a 2-level tree for super_admin (e.g. parent "Web" wrapping the
 *  Grok/Flow/Gateway groups) without modules having to know about it.
 *  Module manifests still declare flat groups; the registry wraps them at
 *  render time based on the caller's role.
 */
export interface NavGroup {
  type: "group";
  /** Stable id (used as React key). */
  key: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  superOnly?: boolean;
  items: NavEntry[];
}

export type NavEntry = NavLeaf | NavGroup;

/** A single route inside a module — mounted under "/" by the router.
 *  Use absolute paths (e.g. "jobs" → "/jobs") so they line up 1:1 with
 *  the sidebar `to` values. */
export interface ModuleRoute {
  /** Path WITHOUT leading slash (react-router child-route convention). */
  path: string;
  element: ReactNode;
}

/** A frontend module is a self-contained product slice — its own pages,
 *  sidebar entries, and optionally its own API base URL.
 *
 *  Modules are registered in `app/moduleRegistry.ts`; `app/router.tsx` and
 *  the sidebar in `components/layout/AppShell.tsx` build themselves from
 *  the registry instead of hard-coding routes/links. That lets a future
 *  module live in a separate git repo whose BE is just an URL away — set
 *  `apiBaseUrl` to the remote root and the module's API calls go there. */
export interface FrontendModule {
  /** Stable internal id, used in logs + as React key in the registry list. */
  name: string;
  /** Human-readable label (mainly for documentation; UI labels live on the
   *  individual nav entries). */
  label: string;
  /** If set, the module's `api.ts` instance proxies through this URL
   *  instead of same-origin. Use for plugged-in remote modules.
   *  Empty string / undefined → same-origin (default — Vite dev server
   *  proxies /api to FastAPI, prod nginx does the same). */
  apiBaseUrl?: string;
  /** Routes the module owns. Each path mounts under "/" — no extra prefix. */
  routes: ModuleRoute[];
  /** Sidebar entries the module contributes. Optional — modules like `auth`
   *  (login/register pages) don't show in the post-login sidebar. */
  nav?: NavEntry[];
}
