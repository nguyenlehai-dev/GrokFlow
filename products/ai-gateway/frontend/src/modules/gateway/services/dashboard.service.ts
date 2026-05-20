import { api } from "@/core/api/axios";

import type { DashboardStats } from "../models/stats";

export const dashboardService = {
  stats: () =>
    api.get<DashboardStats>("/api/v1/gateway/dashboard").then((r) => r.data),
};
