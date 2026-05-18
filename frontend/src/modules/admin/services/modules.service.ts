import { api } from "@/core/api/axios";

export interface AdminModuleRow {
  id: string;
  slug: string;
  version: string;
  git_url: string;
  git_ref: string;
  manifest: Record<string, any>;
  status: "installing" | "updating" | "running" | "stopped" | "error";
  last_error: string | null;
  fe_container_id: string | null;
  be_container_id: string | null;
  db_schema: string;
  installed_at: string;
  installed_by: string | null;
  settings?: Record<string, any>;
}

export interface ContainerStatus {
  status: string | null;
  started_at: string | null;
  restart_count: number | null;
  health: string | null;
}

export interface ModuleRuntime {
  slug: string;
  containers: { fe: ContainerStatus | null; be: ContainerStatus | null };
}

export interface TenantModuleRow {
  domain_id: string;
  module_id: string;
  enabled: boolean;
}

export interface ModuleInstallPayload {
  git_url: string;
  git_ref: string;
  github_pat?: string | null;
  auto_scaffold?: boolean;
  module_label?: string | null;
}

export interface CreateModulePayload {
  github_owner: string;
  github_repo: string;
  github_pat: string;
  private?: boolean;
  module_label?: string | null;
}

const BASE = "/api/admin/modules";

export const adminModulesService = {
  list: () => api.get<AdminModuleRow[]>(BASE).then((r) => r.data),
  install: (payload: ModuleInstallPayload) =>
    api.post<AdminModuleRow>(BASE, payload).then((r) => r.data),
  createAndInstall: (payload: CreateModulePayload) =>
    api.post<AdminModuleRow>(`${BASE}/create`, payload).then((r) => r.data),
  uninstall: (id: string) => api.delete(`${BASE}/${id}`),
  restart: (id: string) =>
    api.post<AdminModuleRow>(`${BASE}/${id}/restart`).then((r) => r.data),
  update: (id: string) =>
    api.post<AdminModuleRow>(`${BASE}/${id}/update`).then((r) => r.data),
  logs: (id: string, kind: "fe" | "be" = "be", tail = 200) =>
    api.get<string>(`${BASE}/${id}/logs`, { params: { kind, tail }, responseType: "text" })
      .then((r) => r.data as unknown as string),
  runtime: (id: string) =>
    api.get<ModuleRuntime>(`${BASE}/${id}/runtime`).then((r) => r.data),
  updateSettings: (id: string, settings: Record<string, any>) =>
    api.patch<AdminModuleRow>(`${BASE}/${id}/settings`, { settings }).then((r) => r.data),
  listTenants: (id: string) =>
    api.get<TenantModuleRow[]>(`${BASE}/${id}/tenants`).then((r) => r.data),
  toggleTenant: (id: string, domainId: string, enabled: boolean) =>
    api.post<TenantModuleRow>(`${BASE}/${id}/tenants`, { domain_id: domainId, enabled })
      .then((r) => r.data),
};
