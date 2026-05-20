import { api } from "@/core/api/axios";

import type { ExecuteResp, GwRequest } from "../models/request";

export const requestsService = {
  list: (limit = 200) =>
    api
      .get<GwRequest[]>(`/api/v1/gateway/requests?limit=${limit}`)
      .then((r) => r.data),

  status: (gwId: string) =>
    api
      .get<ExecuteResp & { status: string }>(
        `/api/v1/gateway/requests/${gwId}/status`,
      )
      .then((r) => r.data),
};
