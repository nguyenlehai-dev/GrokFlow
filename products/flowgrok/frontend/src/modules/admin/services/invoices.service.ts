import { api } from "@/core/api/axios";

import type { AdminInvoice } from "../models/invoice";

export const invoicesService = {
  list: (statusFilter?: string) => {
    const q = statusFilter ? `?status_filter=${statusFilter}` : "";
    return api
      .get<AdminInvoice[]>(`/api/admin/invoices${q}`)
      .then((r) => r.data);
  },
  create: (payload: Record<string, unknown>) =>
    api.post("/api/admin/invoices", payload),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch(`/api/admin/invoices/${id}`, payload),
  remove: (id: string) => api.delete(`/api/admin/invoices/${id}`),
};
