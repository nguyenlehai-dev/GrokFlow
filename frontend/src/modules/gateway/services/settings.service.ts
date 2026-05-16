import { gatewayApi } from "@/core/api/gateway";

import type { SettingsData } from "../models/settings";

const BASE = "/api/settings";

export const settingsService = {
  get: () => gatewayApi.get<SettingsData>(BASE).then((r) => r.data),
  update: (payload: SettingsData) => gatewayApi.put<SettingsData>(BASE, payload),
};
