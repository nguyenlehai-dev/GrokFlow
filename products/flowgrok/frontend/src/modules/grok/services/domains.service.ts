import { api } from "@/core/api/axios";

import type { Domain } from "../models/domain";

export const domainsService = {
  /** Fetches the admin-managed tenant domain list. Used by both the
   *  profile-level assignment modal and the project-level assignment
   *  flow inside ProjectsModal. */
  listAdminDomains: () =>
    api.get<Domain[]>("/api/admin/domains").then((r) => r.data),
};
