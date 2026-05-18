import { api } from "@/core/api/axios";

export interface AdminModuleRow {
  id: string;
  slug: string;
  version: string;
  git_url: string;
  git_ref: string;
  manifest: Record<string, any>;
  status: "installing" | "running" | "stopped" | "error";
  last_error: string | null;
  fe_container_id: string | null;
  be_container_id: string | null;
  db_schema: string;
  installed_at: string;
  installed_by: string | null;
}

export interface ModuleInstallPayload {
  git_url: string;
  git_ref: string;
  github_pat?: string | null;
}

const BASE = "/api/admin/modules";

export const adminModulesService = {
  list: () => api.get<AdminModuleRow[]>(BASE).then((r) => r.data),
  install: (payload: ModuleInstallPayload) =>
    api.post<AdminModuleRow>(BASE, payload).then((r) => r.data),
  uninstall: (id: string) => api.delete(`${BASE}/${id}`),
  restart: (id: string) =>
    api.post<AdminModuleRow>(`${BASE}/${id}/restart`).then((r) => r.data),
};
