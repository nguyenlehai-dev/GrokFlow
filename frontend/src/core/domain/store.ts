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
  require_playground_key: boolean;
  // Per-domain maintenance toggle. When true and the visitor is not an
  // admin, the AppShell + public route guard render a maintenance screen.
  maintenance_mode?: boolean;
  maintenance_message?: string | null;
  // Optional scheduled window. When `maintenance_starts_at` is set:
  //   • If still in the future → the UI shows a marquee banner with the
  //     announcement + countdown.
  //   • Once now >= starts_at → frontend treats the domain as if
  //     maintenance_mode were true (full MaintenancePage).
  // Admin clears these fields when the patch is done.
  maintenance_starts_at?: string | null;
  maintenance_announcement?: string | null;
  // "default" = branded split layout, "admin" = minimal console layout.
  // /admin/login overrides this and always renders "admin".
  login_template?: "default" | "admin";
  // Allowlist of profile-row actions tenant admins can use. Super_admin
  // bypasses on the backend; the frontend reads this to disable buttons.
  allowed_profile_actions?: string[];
}

interface DomainState {
  config: DomainConfig | null;
  loaded: boolean;
  load: () => Promise<void>;
  isPageAllowed: (path: string) => boolean;
  firstAllowedPath: () => string;
}

// Preferred order: pick the most "dashboard-like" page first so the user
// lands on something sensible after login.
const LANDING_PREFERENCE = [
  "/dashboard",
  "/gateway/dashboard",
  "/gateway",
  "/jobs",
  "/profiles",
  "/api-keys",
  "/flow",
  "/billing",
];

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
  require_playground_key: true,
  maintenance_mode: false,
  maintenance_message: null,
  maintenance_starts_at: null,
  maintenance_announcement: null,
  login_template: "default",
  allowed_profile_actions: ["auto_login", "upload_cookies", "stop_vnc", "disable", "delete"],
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
    const allowed = c.allowed_pages ?? [];
    // Exact match or prefix match (handles /jobs/:id etc.)
    return allowed.some((p) => path === p || path.startsWith(p + "/"));
  },
  firstAllowedPath: () => {
    const c = get().config;
    if (!c || c.allow_all_pages) return "/dashboard";
    const allowed = c.allowed_pages ?? [];
    // 1. Preferred dashboard-like pages first
    for (const p of LANDING_PREFERENCE) {
      if (allowed.some((a) => a === p || p.startsWith(a + "/"))) return p;
    }
    // 2. Fallback: first allowed page
    if (allowed.length > 0) return allowed[0];
    return "/dashboard";
  },
}));
