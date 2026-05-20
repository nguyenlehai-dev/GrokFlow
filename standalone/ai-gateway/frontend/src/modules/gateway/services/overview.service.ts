import { gatewayApi } from "@/core/api/gateway";

import type { MetaRecord, OverviewRecord } from "../models/overview";

export const overviewService = {
  overview: () => gatewayApi.get<OverviewRecord>("/api/overview").then((r) => r.data),
  meta: () => gatewayApi.get<MetaRecord>("/api/meta").then((r) => r.data),
};
