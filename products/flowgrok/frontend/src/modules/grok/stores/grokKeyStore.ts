import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Verified Grok API key — persisted to localStorage so refresh doesn't
 *  kick the user back to the lock modal. Mirrors gateway/playgroundKeyStore
 *  intentionally: same mental model + same field names so a copy-paste
 *  between Playground pages doesn't break expectations.
 *
 *  Key is the raw `uxpm_live_...` string — used as Bearer token when
 *  Playground hits `POST /api/jobs` so the job lands under the key's
 *  owner (regardless of who's logged in via JWT in the browser).
 */
interface VerifiedGrokKey {
  key: string;
  label: string;
  user_email: string;
  allowed_providers: string[];
  allowed_job_types: string[];
  daily_limit: number | null;
  used_today: number | null;
  verified_at: number;
}

interface GrokKeyState {
  current: VerifiedGrokKey | null;
  setVerified: (data: Omit<VerifiedGrokKey, "verified_at">) => void;
  clear: () => void;
}

export const useGrokKey = create<GrokKeyState>()(
  persist(
    (set) => ({
      current: null,
      setVerified: (data) =>
        set({ current: { ...data, verified_at: Date.now() } }),
      clear: () => set({ current: null }),
    }),
    { name: "grok-playground-key" },
  ),
);
