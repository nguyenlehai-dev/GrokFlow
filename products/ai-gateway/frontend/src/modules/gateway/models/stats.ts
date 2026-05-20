/** /api/v1/gateway/dashboard — top-level LLM gateway counts. */
export interface DashboardStats {
  vendors_total: number;
  pools_total: number;
  pools_active: number;
  pool_keys_total: number;
  pool_keys_active: number;
  functions_total: number;
  gateway_keys_total: number;
  gateway_keys_active: number;
  requests_total: number;
  requests_failed: number;
  requests_succeeded: number;
  requests_last_24h: number;
}
