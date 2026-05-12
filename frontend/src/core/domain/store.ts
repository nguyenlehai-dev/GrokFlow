import { create } from "zustand";
import { api } from "@/core/api/axios";

export interface DomainConfig {
  hostname: string;
  label: string;
  status: string;
  allow_landing: boolean;
  allow_register: boolean;
  allow_login: boolean;
  allow_all_pages: boolean;
  allowed_pages: string[];
  brand_name: string | null;
}

interface DomainState {
  config: DomainConfig | null;
  loaded: boolean;
  load: () => Promise<void>;
  isPageAllowed: (path: string) => boolean;
}

// Default fail-open config used until /api/domains/config responds.
const DEFAULT: DomainConfig = {
  hostname: typeof window !== "undefined" ? window.location.hostname : "",
  label: "GrokFlow",
  status: "active",
  allow_landing: true,
  allow_register: true,
  allow_login: true,
  allow_all_pages: true,
  allowed_pages: [],
  brand_name: null,
};

export const useDomainStore = create<DomainState>((set, get) => ({
  config: null,
  loaded: false,
  load: async () => {
    try {
      const host = window.location.hostname;
      const { data } = await api.get<DomainConfig>(
        `/api/domains/config?host=${encodeURIComponent(host)}`,
      );
      set({ config: data, loaded: true });
    } catch {
      // Fail open — don't block the UI if the config endpoint is unreachable.
      set({ config: DEFAULT, loaded: true });
    }
  },
  isPageAllowed: (path: string) => {
    const c = get().config;
    if (!c) return true;
    if (c.status === "disabled") return false;
    if (c.allow_all_pages) return true;
    // Exact match or prefix match (handles /jobs/:id etc.)
    return c.allowed_pages.some((p) => path === p || path.startsWith(p + "/"));
  },
}));
