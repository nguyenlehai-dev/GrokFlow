import { api } from "@/core/api/axios";

export interface ToolInstallAdmin {
  id: string;
  tool_id: string;
  machine_name: string | null;
  public_ip: string | null;
  label: string | null;
  description: string | null;
  status: "pending" | "active" | "disabled";
  allow_all_pages: boolean;
  allowed_pages: string[];
  allow_landing: boolean;
  allow_login: boolean;
  allow_register: boolean;
  login_template: string;
  brand_name: string | null;
  assigned_user_id: string | null;
  assigned_user_email: string | null;
  first_seen_at: string;
  last_seen_at: string;
  client_version: string | null;
  /** Per-machine override of the parent domain's daily Grok job quota.
   *  `null` = inherit from domain. When set, the desktop tool reads this
   *  via GET /api/domain/quota and uses it to gate batch submission. */
  jobs_quota_per_day: number | null;
  /** UTC hour 0-23 the daily quota counter rolls over. Default 0 =
   *  midnight UTC. Set differently from the parent domain to give this
   *  machine its own rollover schedule. */
  quota_reset_hour_utc: number;
  created_at: string;
  updated_at: string;
}

export interface ToolInstallUpdate {
  label?: string | null;
  description?: string | null;
  status?: "pending" | "active" | "disabled";
  allow_all_pages?: boolean;
  allowed_pages?: string[];
  allow_landing?: boolean;
  allow_login?: boolean;
  allow_register?: boolean;
  login_template?: "default" | "admin";
  brand_name?: string | null;
  assigned_user_id?: string | null;
  jobs_quota_per_day?: number | null;
  quota_reset_hour_utc?: number;
}

export interface ProvisionUserIn {
  email: string;
  password: string;
  full_name?: string | null;
  plan_id?: string | null;
  pin_as_only_user?: boolean;
}

export interface ProvisionedUser {
  id: string;
  email: string;
  full_name: string | null;
  tool_install_id: string;
}

export const toolInstallsService = {
  list: (params: { q?: string; status?: string; limit?: number } = {}) =>
    api
      .get<ToolInstallAdmin[]>("/api/admin/auth/tool-installs", { params })
      .then((r) => r.data),
  get: (id: string) =>
    api.get<ToolInstallAdmin>(`/api/admin/auth/tool-installs/${id}`).then((r) => r.data),
  update: (id: string, payload: ToolInstallUpdate) =>
    api
      .patch<ToolInstallAdmin>(`/api/admin/auth/tool-installs/${id}`, payload)
      .then((r) => r.data),
  remove: (id: string) =>
    api.delete(`/api/admin/auth/tool-installs/${id}`),
  provisionUser: (id: string, payload: ProvisionUserIn) =>
    api
      .post<ProvisionedUser>(`/api/admin/auth/tool-installs/${id}/provision-user`, payload)
      .then((r) => r.data),
};
