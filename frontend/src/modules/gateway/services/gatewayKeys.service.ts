import { api } from "@/core/api/axios";

import type {
  GatewayKey,
  GatewayKeyCreated,
  GatewayKeyVerifyResponse,
} from "../models/gatewayKey";

const BASE = "/api/v1/gateway/gateway-keys";

export const gatewayKeysService = {
  list: () => api.get<GatewayKey[]>(BASE).then((r) => r.data),
  create: (payload: Record<string, unknown>) =>
    api.post<GatewayKeyCreated>(BASE, payload).then((r) => r.data),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch<GatewayKey>(`${BASE}/${id}`, payload).then((r) => r.data),
  remove: (id: string) => api.delete(`${BASE}/${id}`),

  /** Server-side verify of a `gwk_live_*` key for the Playground lock. */
  verify: (key: string) =>
    api.post<GatewayKeyVerifyResponse>(`${BASE}/verify`, { key }),
};
