import { api } from "@/core/api/axios";

import type { Domain } from "../models/domain";

export const domainsService = {
  list: () => api.get<Domain[]>("/api/admin/domains").then((r) => r.data),
  /** Generic typed variant — callers pass a slimmer `T` when they only
   *  need a subset of fields (e.g. picker dropdowns). */
  listAs: <T = Domain>() => api.get<T[]>("/api/admin/domains").then((r) => r.data),
  create: (payload: Record<string, unknown>) =>
    api.post("/api/admin/domains", payload),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch(`/api/admin/domains/${id}`, payload),
  remove: (id: string) => api.delete(`/api/admin/domains/${id}`),
};
