import { api } from "@/core/api/axios";

import type { Role, RoleLite } from "../models/role";

export const rolesService = {
  /** Domain-id is optional — backend scopes by tenant when caller is a
   *  per-domain admin; super_admin can pass `?domain_id=` to filter. */
  list: (domainId?: string) => {
    const q = domainId ? `?domain_id=${domainId}` : "";
    return api.get<Role[]>(`/api/admin/roles${q}`).then((r) => r.data);
  },
  /** All roles across domains — used by AdminDomainsTab to group roles
   *  per-domain in the summary cell. */
  listAll: () => api.get<RoleLite[]>("/api/admin/roles").then((r) => r.data),
  create: (payload: Record<string, unknown>) =>
    api.post("/api/admin/roles", payload),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch(`/api/admin/roles/${id}`, payload),
  remove: (id: string) => api.delete(`/api/admin/roles/${id}`),
};
