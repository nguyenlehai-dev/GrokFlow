import { api } from "@/core/api/axios";

import type { ApiKey } from "../models/apiKey";

export const apiKeysService = {
  list: (params: { status?: string; domain_id?: string } = {}) => {
    const qp: Record<string, string> = {};
    if (params.status) qp.status = params.status;
    if (params.domain_id) qp.domain_id = params.domain_id;
    return api.get<ApiKey[]>("/api/api-keys", { params: qp }).then((r) => r.data);
  },
  /** Returns the raw response shape — `data.api_key` is the cleartext
   *  key shown ONCE on creation. */
  create: (payload: Record<string, unknown>) =>
    api
      .post<{ name: string; api_key: string }>("/api/api-keys", payload)
      .then((r) => r.data),
  revoke: (id: string) => api.patch(`/api/api-keys/${id}/revoke`),
  remove: (id: string) => api.delete(`/api/api-keys/${id}`),
};
