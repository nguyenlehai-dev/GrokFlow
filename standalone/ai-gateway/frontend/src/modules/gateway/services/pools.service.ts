import { api } from "@/core/api/axios";

import type { Pool, PoolKey } from "../models/pool";

const BASE = "/api/v1/gateway/pools";

export const poolsService = {
  list: () => api.get<Pool[]>(BASE).then((r) => r.data),
  create: (payload: Record<string, unknown>) => api.post<Pool>(BASE, payload),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch<Pool>(`${BASE}/${id}`, payload),
  remove: (id: string) => api.delete(`${BASE}/${id}`),

  listKeys: (poolId: string) =>
    api.get<PoolKey[]>(`${BASE}/${poolId}/keys`).then((r) => r.data),
  addKey: (poolId: string, payload: Record<string, unknown>) =>
    api.post<PoolKey>(`${BASE}/${poolId}/keys`, payload),
  removeKey: (poolId: string, keyId: string) =>
    api.delete(`${BASE}/${poolId}/keys/${keyId}`),
};
