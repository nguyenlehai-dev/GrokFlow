import { api } from "@/core/api/axios";

import type { PublicPlan } from "../models/plans";

export const plansPublicService = {
  list: () => api.get<PublicPlan[]>("/api/plans/public").then((r) => r.data),
};
