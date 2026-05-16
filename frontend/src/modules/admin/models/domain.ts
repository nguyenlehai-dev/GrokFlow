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
