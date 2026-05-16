export interface Pool {
  id: string;
  vendor_id: string;
  vendor_name: string;
  function_id: string | null;
  function_name: string | null;
  code: string;
  name: string;
  model: string | null;
  description: string | null;
  status: string;
  keys_total: number;
  keys_active: number;
}

export interface PoolKey {
  id: string;
  pool_id: string;
  name: string;
  key_prefix: string;
  project_id: string | null;
  priority: number;
  status: string;
  used_count: number;
  last_used_at: string | null;
  created_at: string;
}

/** Lighter projection used by Playground pool dropdown. */
export interface PoolRef {
  id: string;
  name: string;
  vendor_id: string;
  function_id: string | null;
  model: string | null;
}
