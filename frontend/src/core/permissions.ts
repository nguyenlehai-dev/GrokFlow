/**
 * Permission rules — single source of truth.
 *
 * Three role tiers:
 *   super_admin → global, sees + manages everything
 *   admin       → per-domain admin, scoped to user.domain_id
 *                 + always reaches /admin/users + /admin/roles
 *   user/support→ scoped to user.effective_allowed_pages (role ∩ domain)
 *
 * Modules MUST go through this module (or the helpers re-exported from
 * core/auth/store.ts) for any role / page visibility decision. Never
 * inline `role === "admin"` checks in module code — that's what made
 * the audit surface 2 conflicting permission policies before.
 */

export type RoleTier = "super_admin" | "admin" | "user" | "support";

export interface PermissionUser {
  role: RoleTier | string;
  domain_id?: string | null;
  role_id?: string | null;
  effective_allowed_pages?: string[] | null;
  entitlements?: { features?: Record<string, boolean> };
}

/** Pages a per-domain admin can always reach (their domain's user + role
 *  management). Without this, granting a domain only /gateway/* would
 *  lock the domain admin out of managing their own tenant's users.
 *  Keep this list short — it bypasses domain.allowed_pages.
 *
 *  ⚠️ Do NOT add global-infra routes here (`/servers`, `/admin/plans`,
 *  `/admin/domains`, `/admin/billing`, `/admin/git`). Those use
 *  `SuperAdminUser` on the backend — a domain admin sneaking past the
 *  FE menu would just hit 403 from every API call.
 */
export const ADMIN_BUILTIN_PATHS: readonly string[] = [
  "/admin/users",
  "/admin/roles",
];

export function isSuperAdmin(user: PermissionUser | null | undefined): boolean {
  return user?.role === "super_admin";
}

export function isAnyAdmin(user: PermissionUser | null | undefined): boolean {
  return user?.role === "super_admin" || user?.role === "admin";
}

function matchesAny(allowed: readonly string[], path: string): boolean {
  return allowed.some((p) => path === p || path.startsWith(p + "/"));
}

/** Decide whether a given route path is accessible to the user.
 *
 *  Tier rules:
 *    super_admin → always true.
 *    admin       → /admin/users + /admin/roles always; everything else
 *                  must be in user.effective_allowed_pages (which the
 *                  backend pre-computes from the domain's allowed_pages).
 *    user/support→ must be in user.effective_allowed_pages.
 *
 *  Falls back to the caller-supplied `domainCheck` when the backend
 *  hasn't sent a per-user allowlist yet (boot tick, or legacy unscoped
 *  users), so the UI doesn't false-block during page load. */
export function userCanSeePath(
  user: PermissionUser | null | undefined,
  path: string,
  domainCheck: (p: string) => boolean,
): boolean {
  if (!user) return domainCheck(path);
  if (user.role === "super_admin") return true;

  if (user.role === "admin") {
    if (matchesAny(ADMIN_BUILTIN_PATHS, path)) return true;
    const eff = user.effective_allowed_pages;
    if (Array.isArray(eff)) return matchesAny(eff, path);
    return domainCheck(path);
  }

  // user / support tier
  const eff = user.effective_allowed_pages;
  if (Array.isArray(eff)) return matchesAny(eff, path);
  return domainCheck(path);
}

/** Plan-entitlement feature gate. Admins bypass. */
export function userHasFeature(
  user: PermissionUser | null | undefined,
  feature: string,
): boolean {
  if (!user) return false;
  if (isAnyAdmin(user)) return true;
  return Boolean(user.entitlements?.features?.[feature]);
}
