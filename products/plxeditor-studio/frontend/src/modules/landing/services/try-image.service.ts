import axios from "axios";

import type {
  TryImagePayload,
  TryImageQuotaResponse,
  TryImageResponse,
} from "../models/try-image";

/** Public Grok-Image "try-it" endpoints.
 *
 *  Uses raw axios (not the shared `api` instance) on purpose: these routes
 *  are anonymous-friendly and must NOT carry the JWT interceptor's auth
 *  header — for IP-rate-limited anon users we want the BE to see no token.
 *  Auth users still fall into the same endpoints; the BE switches the
 *  quota source by inspecting whether a token is present in the request.
 *  Because raw axios is same-origin, no baseURL prefix is needed. */
export const tryImageService = {
  quota: () =>
    axios.get<TryImageQuotaResponse>("/api/public/try-image/quota").then((r) => r.data),

  submit: (payload: TryImagePayload) =>
    axios.post<TryImageResponse>("/api/public/try-image", payload).then((r) => r.data),

  poll: (jobId: string) =>
    axios.get<TryImageResponse>(`/api/public/try-image/${jobId}`).then((r) => r.data),
};
