import { api } from "@/core/api/axios";

import type { Project, UserRow } from "../models/project";

export const projectsService = {
  list: (profileId: string) =>
    api
      .get<Project[]>("/api/grok-projects", { params: { profile_id: profileId } })
      .then((r) => r.data),

  create: (payload: Record<string, unknown>) =>
    api.post<Project>("/api/grok-projects", payload).then((r) => r.data),

  update: (id: string, payload: Record<string, unknown>) =>
    api.patch(`/api/grok-projects/${id}`, payload),

  remove: (id: string) => api.delete(`/api/grok-projects/${id}`),

  getDomains: (id: string) =>
    api
      .get<{ project_id: string; domain_ids: string[] }>(
        `/api/grok-projects/${id}/domains`,
      )
      .then((r) => r.data),

  setDomains: (id: string, domain_ids: string[]) =>
    api.put(`/api/grok-projects/${id}/domains`, { domain_ids }),

  getUsers: (id: string) =>
    api
      .get<{ project_id: string; user_ids: string[] }>(
        `/api/grok-projects/${id}/users`,
      )
      .then((r) => r.data),

  setUsers: (id: string, user_ids: string[]) =>
    api.put(`/api/grok-projects/${id}/users`, { user_ids }),

  usersByDomain: (domainId: string) =>
    api
      .get<UserRow[]>(`/api/grok-projects/_users-by-domain/${domainId}`)
      .then((r) => r.data),

  autoProvision: (payload: Record<string, unknown>) =>
    api
      .post<Project>("/api/grok-projects/auto-provision", payload)
      .then((r) => r.data),
};
