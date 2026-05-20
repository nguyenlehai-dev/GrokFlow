import { api } from "@/core/api/axios";

import type { AuditLog, AuditLogPageOut } from "../models/auditLog";

export const auditService = {
  /** Caller's own logs — flat list, no pagination headers. */
  listSelf: (params: { action?: string } = {}) =>
    api.get<AuditLog[]>("/api/audit-logs", { params }).then((r) => r.data),

  /** Admin paged endpoint — supports rich filtering + offset/limit. */
  listAdmin: (params: Record<string, string | number>) =>
    api
      .get<AuditLogPageOut>("/api/audit-logs/admin", { params })
      .then((r) => r.data),
};
