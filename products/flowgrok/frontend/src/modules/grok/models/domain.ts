export interface Domain {
  id: string;
  hostname: string;
  /** Display label — set by ProjectsModal flow. Optional because the
   *  ProfileDomainsModal only needs hostname + status. */
  label?: string;
  status?: string;
}

export interface ProfileDomainsResponse {
  profile_id: string;
  domain_ids: string[];
}
