import { create } from "zustand";
import { persist } from "zustand/middleware";

interface VerifiedKey {
  key: string;            // gwk_live_… — full token, kept in localStorage
  label: string;
  allowed_functions: string[];
  verified_at: number;    // unix ms
}

interface PlaygroundKeyState {
  current: VerifiedKey | null;
  setVerified: (key: string, label: string, allowed_functions: string[]) => void;
  clear: () => void;
}

/** Persists the Playground's verified Gateway API Key in localStorage.
 *  Non-admin visitors must verify a key before the Playground unlocks;
 *  admin role bypasses this entirely (see Playground page guard).
 */
export const usePlaygroundKey = create<PlaygroundKeyState>()(
  persist(
    (set) => ({
      current: null,
      setVerified: (key, label, allowed_functions) =>
        set({ current: { key, label, allowed_functions, verified_at: Date.now() } }),
      clear: () => set({ current: null }),
    }),
    { name: "gateway-playground-key" },
  ),
);
