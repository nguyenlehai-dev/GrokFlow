import { api } from "@/core/api/axios";

import type { AdminSubscription } from "../models/subscription";

export const subscriptionsService = {
  list: (statusFilter?: string) => {
    const q = statusFilter ? `?status_filter=${statusFilter}` : "";
    return api
      .get<AdminSubscription[]>(`/api/admin/subscriptions${q}`)
      .then((r) => r.data);
  },
  create: (payload: Record<string, unknown>) =>
    api.post("/api/admin/subscriptions", payload),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch(`/api/admin/subscriptions/${id}`, payload),
  remove: (id: string) => api.delete(`/api/admin/subscriptions/${id}`),
  /** Marks a `pending` subscription as paid; backend activates entitlements. */
  confirmPayment: (id: string) =>
    api.post(`/api/admin/subscriptions/${id}/confirm-payment`),

  /** Self-service cancel — issued by the owning user from /billing. */
  cancelOwn: (id: string) => api.post(`/api/billing/subscriptions/${id}/cancel`),
};
