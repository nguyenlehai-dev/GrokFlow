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
};
