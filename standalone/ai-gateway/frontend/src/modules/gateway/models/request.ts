export interface GwRequest {
  id: string;
  gw_id: string;
  vendor_name: string | null;
  pool_name: string | null;
  pool_key_name: string | null;
  function_code: string | null;
  model: string | null;
  status: string;
  error_message: string | null;
  latency_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_cents: number | null;
  request_body: Record<string, any> | null;
  response_body: Record<string, any> | null;
  created_at: string;
}

/** Response shape returned by execute / submit / status endpoints. */
export interface ExecuteResp {
  request_id: string;
  gw_id: string;
  status: string;
  pool_key_name: string | null;
  response: any;
  error_message: string | null;
}
