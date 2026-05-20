export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  status: string;
  allowed_providers: string[];
  allowed_job_types: string[];
  rate_limit_per_minute: number;
  daily_limit: number;
  used_today: number;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  // Enriched (admin/super_admin viewer)
  user_id: string;
  user_email: string | null;
  domain_id: string | null;
  domain_hostname: string | null;
}
