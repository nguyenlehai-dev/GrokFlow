import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SubscriptionStatus =
  | "active"
  | "pending"
  | "past_due"
  | "expired"
  | "cancelled"
  | "none";

export interface Entitlements {
  plan_code: string | null;
  plan_name: string | null;
  /** Billing health for the current paid plan. UI shows a "renew now"
   *  banner when this is `past_due` or `expired`. See backend
   *  `resolve_user_plan_with_status` for the resolution rules. */
  subscription_status: SubscriptionStatus;
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
  // Tool install scope. Non-null = desktop kiosk user; FE skips the admin
  // shell + auto-lands on /create-video-pro on login.
  tool_install_id?: string | null;
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
  // UI preferences echoed back from /api/auth/me.
  locale?: string | null;
  notification_prefs?: Record<string, { email: boolean; in_app: boolean }> | null;
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

// userCanSeePath lives in core/permissions.ts — re-exported so existing
// imports `from "@/core/auth/store"` keep working without churn.
export { userCanSeePath } from "@/core/permissions";
