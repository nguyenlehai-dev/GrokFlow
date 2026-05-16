export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  role_id: string | null;
  status: string;
  created_at: string;
  plan_id: string | null;
  domain_id: string | null;
  entitlement_overrides: Record<string, unknown> | null;
}

/** Lightweight option used by selectors / pickers. */
export interface DomainOpt {
  id: string;
  hostname: string;
  label: string;
}

export interface RoleOpt {
  id: string;
  name: string;
  domain_id: string;
  status: string;
}

export interface AdminStats {
  total_users: number;
  total_api_keys: number;
  total_profiles: number;
  total_jobs: number;
  jobs_24h_success: number;
  jobs_24h_failed: number;
}

export interface EntitlementCatalog {
  features: Record<string, string>;
  limits: Record<string, string>;
}

export interface EffectiveEntitlements {
  features: Record<string, boolean>;
  limits: Record<string, number>;
  plan_code: string | null;
  plan_name: string | null;
}
