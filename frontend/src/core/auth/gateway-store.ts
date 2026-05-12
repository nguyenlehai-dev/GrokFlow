import { create } from "zustand";
import { persist } from "zustand/middleware";
import { gatewayApi } from "@/core/api/gateway";

interface GatewayAuthState {
  token: string | null;
  expiresAt: number | null;
  username: string | null;
  setToken: (token: string, expiresIn: number, username: string) => void;
  clear: () => void;
  isValid: () => boolean;
  login: (username: string, password: string) => Promise<void>;
}

/** Persists the gatewaygrok admin token in localStorage so users only login
 *  once per session. Separate from the GrokFlow JWT — gatewaygrok has its
 *  own admin auth (username/password configured via GATEWAY_ADMIN_* env vars).
 */
export const useGatewayAuthStore = create<GatewayAuthState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      username: null,
      setToken: (token, expiresIn, username) => set({
        token,
        username,
        expiresAt: Date.now() + expiresIn * 1000,
      }),
      clear: () => set({ token: null, expiresAt: null, username: null }),
      isValid: () => {
        const { token, expiresAt } = get();
        if (!token || !expiresAt) return false;
        return Date.now() < expiresAt - 30_000; // 30s safety margin
      },
      login: async (username, password) => {
        const { data } = await gatewayApi.post<{
          access_token: string;
          expires_in: number;
          username: string;
        }>("/api/auth/login", { username, password });
        set({
          token: data.access_token,
          expiresAt: Date.now() + data.expires_in * 1000,
          username: data.username,
        });
      },
    }),
    { name: "gateway-auth" },
  ),
);
