export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  domain_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Paged response shape returned by /api/audit-logs/admin. */
export interface AuditLogPageOut {
  rows: AuditLog[];
  total: number;
  offset: number;
  limit: number;
}
