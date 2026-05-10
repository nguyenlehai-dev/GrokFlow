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
  role: "admin" | "user" | "support";
  status: string;
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

/** Hook helper — admins always pass any feature check. */
export function useFeature(key: string): boolean {
  const user = useAuthStore((s) => s.user);
  if (!user) return false;
  if (user.role === "admin") return true;
  return Boolean(user.entitlements?.features?.[key]);
}

/** Returns the numeric limit (0 = unlimited). Admins → 0 (unlimited). */
export function useLimit(key: string): number {
  const user = useAuthStore((s) => s.user);
  if (!user) return 0;
  if (user.role === "admin") return 0;
  return user.entitlements?.limits?.[key] ?? 0;
}
