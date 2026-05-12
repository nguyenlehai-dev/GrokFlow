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

/** Decide whether a given route path is accessible to the user given their
 *  per-user effective allowlist (preferred) or the domain's broader list.
 *  Returns true when there is no restriction (super_admin / legacy / empty
 *  state during boot).
 *
 *  Pure helper — caller passes both the user and the domain check so this
 *  module doesn't import the domain store and create a circular dep.
 */
export function userCanSeePath(
  user: User | null,
  path: string,
  domainCheck: (p: string) => boolean,
): boolean {
  if (!user) return domainCheck(path);
  if (isAnyAdmin(user.role)) return true;
  const userAllowed = user.effective_allowed_pages;
  if (Array.isArray(userAllowed)) {
    // Match same way as domain store: exact OR prefix-match (handles /jobs/:id).
    return userAllowed.some((p) => path === p || path.startsWith(p + "/"));
  }
  // Fall back to domain-level check when no user-specific list was provided
  // (e.g. user has no domain_id, or boot hasn't fetched /me yet).
  return domainCheck(path);
}
