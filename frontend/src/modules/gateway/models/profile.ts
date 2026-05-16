import type { Category } from "../configs/providerVisuals";

/** Browser-automation profile (gateway-proxy /api/profiles). */
export interface Profile {
  id: string;
  name: string;
  category: Category;
  description: string | null;
  is_active: boolean;
  proxy_id: string | null;
  tags: string[];
  antidetect: any;
  concurrency_limit: number;
  cookie_file: string | null;
  cache_dir: string;
  user_data_dir: string;
  created_at: string;
  updated_at: string;
}

/** Lighter projection used by CreateJob form. */
export interface ProfileRef {
  id: string;
  name: string;
  category: string;
}
