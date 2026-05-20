import { api } from "@/core/api/axios";

import type { Plan, PublicPlan } from "../models/plan";

export const plansService = {
  list: () => api.get<Plan[]>("/api/admin/plans").then((r) => r.data),
  create: (payload: Record<string, unknown>) =>
    api.post("/api/admin/plans", payload),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch(`/api/admin/plans/${id}`, payload),
  remove: (id: string) => api.delete(`/api/admin/plans/${id}`),

  /** Public catalog used by /checkout/:plan_code — no auth required. */
  listPublic: () =>
    api.get<PublicPlan[]>("/api/plans/public").then((r) => r.data),
};
