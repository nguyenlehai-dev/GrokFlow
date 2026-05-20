import { gatewayApi } from "@/core/api/gateway";

import type { ApiKey, ApiKeyCreated } from "../models/apiKey";

const BASE = "/api/api-keys";

export const apiKeysService = {
  list: () => gatewayApi.get<ApiKey[]>(BASE).then((r) => r.data),
  create: (payload: Record<string, unknown>) =>
    gatewayApi.post<ApiKeyCreated>(BASE, payload).then((r) => r.data),
  remove: (id: string) => gatewayApi.delete(`${BASE}/${id}`),
};
