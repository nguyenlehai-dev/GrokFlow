import { api } from "@/core/api/axios";

import type {
  GitRepoRow,
  GitStatus,
  DeployResult,
  GitEnv,
} from "../models/git";

export const gitService = {
  listRepos: () =>
    api.get<GitRepoRow[]>("/api/admin/git/repos").then((r) => r.data),
  createRepo: (payload: Record<string, unknown>) =>
    api.post("/api/admin/git/repos", payload),
  updateRepo: (id: string, payload: Record<string, unknown>) =>
    api.patch(`/api/admin/git/repos/${id}`, payload),
  removeRepo: (id: string) => api.delete(`/api/admin/git/repos/${id}`),

  status: (id: string) =>
    api
      .get<GitStatus>(`/api/admin/git/repos/${id}/status`)
      .then((r) => r.data),

  /** Triggers a docker-compose pull/rebuild/up for the given services.
   *  Resolves with stdout/stderr in `log` even when ok=false. */
  deploy: (
    id: string,
    payload: { services: string[] | null; pull: boolean; rebuild: boolean },
  ) =>
    api
      .post<DeployResult>(`/api/admin/git/repos/${id}/deploy`, payload)
      .then((r) => r.data),

  getEnv: (id: string) =>
    api.get<GitEnv>(`/api/admin/git/repos/${id}/env`).then((r) => r.data),
  saveEnv: (id: string, content: string) =>
    api.put(`/api/admin/git/repos/${id}/env`, { content }),
};
