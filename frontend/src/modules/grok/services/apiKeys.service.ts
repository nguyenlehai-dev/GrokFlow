import { api } from "@/core/api/axios";

import type { GeneratedKey, VerifyKeyResponse } from "../models/apiKey";

export const apiKeysService = {
  create: (payload: Record<string, unknown>) =>
    api.post<GeneratedKey>("/api/api-keys", payload).then((r) => r.data),

  verify: (key: string) =>
    api.post<VerifyKeyResponse>("/api/api-keys/verify", { key }).then((r) => r.data),
};
