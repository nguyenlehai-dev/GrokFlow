import type { Category } from "../configs/providerVisuals";

export interface OverviewRecord {
  profiles: { total: number; active: number };
  proxies: { total: number; active: number };
  api_keys: { total: number; active: number };
  queue: { pending: number; running: number; succeeded: number; failed: number };
  categories: Array<{ category: Category; total: number }>;
}

export interface MetaRecord {
  categories: Category[];
  job_targets: string[];
  job_statuses: string[];
  providers: Array<{
    category: Category;
    provider_name: string;
    targets: string[];
    supports_cookie_import: boolean;
    supports_proxy: boolean;
    supports_antidetect: boolean;
    start_url: string | null;
    notes: string | null;
  }>;
}
