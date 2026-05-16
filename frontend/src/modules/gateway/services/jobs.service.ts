import { gatewayApi } from "@/core/api/gateway";

import type { Job } from "../models/job";

const BASE = "/api/jobs";

export const jobsService = {
  list: () => gatewayApi.get<Job[]>(BASE).then((r) => r.data),
  create: (payload: Record<string, unknown>) => gatewayApi.post<Job>(BASE, payload),
  retry: (id: string) => gatewayApi.post(`${BASE}/${id}/retry`),
};
