import { api } from "@/core/api/axios";

import type { ProfileDomainsResponse } from "../models/domain";
import type { Profile } from "../models/profile";
import type { VncSession } from "../models/vnc";

export const profilesService = {
  list: () => api.get<Profile[]>("/api/profiles").then((r) => r.data),

  create: (payload: Record<string, unknown>) => api.post("/api/profiles", payload),

  update: (id: string, payload: Record<string, unknown>) =>
    api.patch(`/api/profiles/${id}`, payload),

  remove: (id: string) => api.delete(`/api/profiles/${id}`),

  disable: (id: string) => api.post(`/api/profiles/${id}/disable`),
  /** Force-clear a profile stuck on `running_job` — counters reset to
   *  match real running-job count and status flips back to `logged_in`
   *  when no live jobs remain. See backend reset_stuck_profile route. */
  resetStuck: (id: string) => api.post<Profile>(`/api/profiles/${id}/reset-stuck`).then((r) => r.data),
  stopVnc: (id: string) => api.post(`/api/profiles/${id}/stop-vnc`),
  /** Kill the VNC container + refresh nginx map + reset profile status
   *  to need_login. One-click recovery when Chromium crashed inside but
   *  Docker still reports the container healthy (CDP discovery error). */
  resetCdp: (id: string) => api.post<{
    profile_id: string;
    profile_status: string;
    container_was_removed: boolean;
    map_refreshed: boolean;
    next_action: string;
    message: string;
  }>(`/api/profiles/${id}/reset-cdp`).then((r) => r.data),

  startVncSession: (id: string) =>
    api.post<VncSession>(`/api/profiles/${id}/start-vnc-session`).then((r) => r.data),
  finishVncSession: (id: string) =>
    api.post(`/api/profiles/${id}/finish-vnc-session`),

  uploadCookies: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`/api/profiles/${id}/upload-cookies`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  getDomains: (id: string) =>
    api.get<ProfileDomainsResponse>(`/api/profiles/${id}/domains`).then((r) => r.data),

  setDomains: (id: string, domain_ids: string[]) =>
    api.put<ProfileDomainsResponse>(`/api/profiles/${id}/domains`, { domain_ids }),
};
