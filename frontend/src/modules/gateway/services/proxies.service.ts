import { gatewayApi } from "@/core/api/gateway";

import type { Proxy } from "../models/proxy";

const BASE = "/api/proxies";

export const proxiesService = {
  list: () => gatewayApi.get<Proxy[]>(BASE).then((r) => r.data),
  create: (payload: Record<string, unknown>) => gatewayApi.post<Proxy>(BASE, payload),
  update: (id: string, payload: Record<string, unknown>) =>
    gatewayApi.put<Proxy>(`${BASE}/${id}`, payload),
  remove: (id: string) => gatewayApi.delete(`${BASE}/${id}`),
};
