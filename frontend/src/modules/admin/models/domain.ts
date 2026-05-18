export interface Domain {
  id: string;
  hostname: string;
  label: string;
  description: string | null;
  status: string;
  allow_landing: boolean;
  allow_register: boolean;
  allow_login: boolean;
  allow_all_pages: boolean;
  allowed_pages: string[];
  brand_name: string | null;
  require_playground_key: boolean;
  maintenance_mode?: boolean;
  maintenance_message?: string | null;
  maintenance_starts_at?: string | null;
  maintenance_announcement?: string | null;
  login_template?: "default" | "admin";
  allowed_profile_actions?: string[];
  /** Daily Grok job quota. `null` (or undefined) = unlimited. When set,
   *  POST /api/jobs returns 429 once `used` reaches this number for the
   *  current UTC day. Tool desktop polls GET /api/domain/quota to render
   *  a "127/500 hôm nay" pill on its topbar. */
  jobs_quota_per_day?: number | null;
  /** UTC hour (0-23) the daily quota counter rolls over. Default 0 =
   *  midnight UTC. Set to 17 for "midnight Vietnam local" rollover. */
  quota_reset_hour_utc?: number;
}

/** Slimmer projection used inside the Roles editor — only fields needed
 *  to look up `allow_all_pages` + `allowed_pages` per domain. */
export interface DomainForRoles {
  id: string;
  hostname: string;
  label: string;
  allow_all_pages: boolean;
  allowed_pages: string[];
}
