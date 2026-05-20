import { api } from "@/core/api/axios";

import type { AdminPayment } from "../models/payment";

export const paymentsService = {
  list: (statusFilter?: string) => {
    const q = statusFilter ? `?status_filter=${statusFilter}` : "";
    return api
      .get<AdminPayment[]>(`/api/admin/payments${q}`)
      .then((r) => r.data);
  },
  create: (payload: Record<string, unknown>) =>
    api.post("/api/admin/payments", payload),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch(`/api/admin/payments/${id}`, payload),
  remove: (id: string) => api.delete(`/api/admin/payments/${id}`),
};
