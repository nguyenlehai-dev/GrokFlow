export interface Role {
  id: string;
  domain_id: string;
  name: string;
  description: string | null;
  allowed_pages: string[];
  status: "active" | "disabled";
  user_count: number;
  created_at: string | null;
}

/** Lighter role record returned alongside the Domains list — used for the
 *  per-domain roles summary cell. */
export interface RoleLite {
  id: string;
  domain_id: string;
  name: string;
  status: "active" | "disabled";
  user_count: number;
}
