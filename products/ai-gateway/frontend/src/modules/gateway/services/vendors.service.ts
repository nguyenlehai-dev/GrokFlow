import { api } from "@/core/api/axios";

import type { Vendor } from "../models/vendor";

const BASE = "/api/v1/gateway/vendors";

export const vendorsService = {
  list: () => api.get<Vendor[]>(BASE).then((r) => r.data),
  create: (payload: Record<string, unknown>) => api.post<Vendor>(BASE, payload),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch<Vendor>(`${BASE}/${id}`, payload),
  remove: (id: string) => api.delete(`${BASE}/${id}`),
};
