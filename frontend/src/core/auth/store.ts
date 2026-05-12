import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Entitlements {
  plan_code: string | null;
  plan_name: string | null;
  features: Record<string, boolean>;
  limits: Record<string, number>;
}

interface User {
  id: string;
  email: string;
  full_name: string | null;
  // super_admin = global admin (manages all domains, plans, providers)
  // admin       = per-domain admin (scoped to domain_id)
  // user        = regular tenant user
  role: "super_admin" | "admin" | "user" | "support";
  status: string;
  // Tenant membership. null for super_admin / legacy unscoped users.
  domain_id?: string | null;
  // Per-domain named role (FK to Role row). When set, the user's menu is
  // further narrowed by role.allowed_pages.
  role_id?: string | null;
  role_name?: string | null;
  // Pre-computed by the backend: (role.allowed_pages ∩ domain.allowed_pages)
  // or just domain.allowed_pages when no role is assigned. The FE menu /
  // ProtectedRoute use this in place of domain.allowed_pages.
  // null = no restriction (super_admin or legacy unscoped user).
  effective_allowed_pages?: string[] | null;
  entitlements?: Entitlements;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  setEntitlements: (ent: Entitlements) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      setEntitlements: (ent) =>
        set((s) => (s.user ? { user: { ...s.user, entitlements: ent } } : s)),
      clear: () => set({ token: null, user: null }),
    }),
    { name: "grokflow-auth" },
  ),
);

/** Both tiers of admin bypass entitlement gates. */
function isAnyAdmin(role: string | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

/** Hook helper — admins always pass any feature check. */
export function useFeature(key: string): boolean {
  const user = useAuthStore((s) => s.user);
  if (!user) return false;
  if (isAnyAdmin(user.role)) return true;
  return Boolean(user.entitlements?.features?.[key]);
}

/** Returns the numeric limit (0 = unlimited). Admins → 0 (unlimited). */
export function useLimit(key: string): number {
  const user = useAuthStore((s) => s.user);
  if (!user) return 0;
  if (isAnyAdmin(user.role)) return 0;
  return user.entitlements?.limits?.[key] ?? 0;
}

/** Pages a per-domain admin can always reach (their domain's user + role
 *  management). Without this, granting a domain only /gateway/* would
 *  lock the domain admin out of managing their own users. */
const ADMIN_BUILTIN_PATHS = ["/admin/users", "/admin/roles"];

function _matchesAny(allowed: string[], path: string): boolean {
  return allowed.some((p) => path === p || path.startsWith(p + "/"));
}

/** Decide whether a given route path is accessible to the user.
 *
 *  Tier rules:
 *    super_admin → bypass everything (cross-domain).
 *    admin       → always sees /admin/users + /admin/roles for their domain;
 *                  every other path must be in their domain's allowlist
 *                  (effective_allowed_pages is set to domain.allowed_pages
 *                  by the backend when there is no per-user role).
 *    user        → must be in effective_allowed_pages (role ∩ domain).
 *
 *  Falls back to the domain-level check when the backend hasn't yet
 *  returned a per-user allowlist (boot tick, or legacy unscoped users).
 *
 *  Pure helper — caller passes the domain check so this module doesn't
 *  import the domain store and create a circular dep.
 */
export function userCanSeePath(
  user: User | null,
  path: string,
  domainCheck: (p: string) => boolean,
): boolean {
  if (!user) return domainCheck(path);
  if (user.role === "super_admin") return true;

  if (user.role === "admin") {
    if (_matchesAny(ADMIN_BUILTIN_PATHS, path)) return true;
    // Per-domain admin uses effective_allowed_pages too (it's the domain's
    // list when they have no role). Falls back to domainCheck if missing.
    const eff = user.effective_allowed_pages;
    if (Array.isArray(eff)) return _matchesAny(eff, path);
    return domainCheck(path);
  }

  // user / support
  const eff = user.effective_allowed_pages;
  if (Array.isArray(eff)) return _matchesAny(eff, path);
  return domainCheck(path);
}
