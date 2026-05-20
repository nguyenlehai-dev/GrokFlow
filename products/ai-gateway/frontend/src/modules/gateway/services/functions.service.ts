import { api } from "@/core/api/axios";

import type { GwFunction } from "../models/function";

const BASE = "/api/v1/gateway/functions";

export const functionsService = {
  list: () => api.get<GwFunction[]>(BASE).then((r) => r.data),
  create: (payload: Record<string, unknown>) => api.post<GwFunction>(BASE, payload),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch<GwFunction>(`${BASE}/${id}`, payload),
  remove: (id: string) => api.delete(`${BASE}/${id}`),
};
