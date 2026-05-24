import { api } from "@/core/api/axios";

import type {
  AdminUser,
  AdminStats,
  EntitlementCatalog,
  EffectiveEntitlements,
} from "../models/user";

export const usersService = {
  list: () => api.get<AdminUser[]>("/api/admin/users").then((r) => r.data),
  create: (payload: Record<string, unknown>) =>
    api.post("/api/admin/users", payload),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch(`/api/admin/users/${id}`, payload),
  remove: (id: string) => api.delete(`/api/admin/users/${id}`),

  stats: () => api.get<AdminStats>("/api/admin/stats").then((r) => r.data),

  entitlementCatalog: () =>
    api
      .get<EntitlementCatalog>("/api/admin/entitlements/catalog")
      .then((r) => r.data),

  effectiveEntitlements: (userId: string) =>
    api
      .get<EffectiveEntitlements>(
        `/api/admin/users/${userId}/effective-entitlements`,
      )
      .then((r) => r.data),

  quickProvision: (payload: QuickProvisionIn) =>
    api
      .post<QuickProvisionOut>("/api/admin/users/quick-provision", payload)
      .then((r) => r.data),
};

export interface QuickProvisionIn {
  email: string;
  password: string;
  full_name: string;
  role?: "user" | "admin" | "support";
  plan_id?: string | null;
  domain_id?: string | null;
  new_domain?: {
    hostname: string;
    label?: string | null;
    jobs_quota_per_day?: number | null;
  } | null;
  tool_install_id?: string | null;
  pin_as_only_user?: boolean;
  create_api_key?: boolean;
  api_key_name?: string;
  api_key_providers?: string[];
  api_key_job_types?: string[];
  api_key_daily_limit?: number;
}

export interface QuickProvisionOut {
  user_id: string;
  user_email: string;
  domain_id: string | null;
  domain_hostname: string | null;
  tool_install_id?: string | null;
  tool_install_label?: string | null;
  api_key: string | null;
  api_key_id: string | null;
  api_key_prefix: string | null;
  login_url: string;
  note: string;
}
