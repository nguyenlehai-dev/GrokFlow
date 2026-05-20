import { gatewayApi } from "@/core/api/gateway";

import type { Profile } from "../models/profile";
import type { SessionCheckRecord } from "../configs/providerVisuals";

const BASE = "/api/profiles";

export const profilesService = {
  list: () => gatewayApi.get<Profile[]>(BASE).then((r) => r.data),
  create: (payload: Record<string, unknown>) => gatewayApi.post<Profile>(BASE, payload),
  update: (id: string, payload: Record<string, unknown>) =>
    gatewayApi.put<Profile>(`${BASE}/${id}`, payload),
  remove: (id: string) => gatewayApi.delete(`${BASE}/${id}`),

  /** Multipart upload — Netscape `.txt` or JSON cookie export. */
  uploadCookies: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return gatewayApi.post(`${BASE}/${id}/cookies`, fd);
  },

  /** Trigger headless session check (login state + screenshot). */
  sessionCheck: (id: string) =>
    gatewayApi
      .post<SessionCheckRecord>(`${BASE}/${id}/session-check`)
      .then((r) => r.data),

  /** Open the headed browser on the host so admin can log in interactively. */
  launchLogin: (id: string) =>
    gatewayApi
      .post<{ message: string }>(`${BASE}/${id}/launch-login`)
      .then((r) => r.data),
};
