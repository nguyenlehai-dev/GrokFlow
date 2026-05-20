export interface GatewayKey {
  id: string;
  label: string;
  prefix: string;
  allowed_functions: string[];
  status: string;
  webhook_url: string | null;
  rate_limit_per_minute: number;
  daily_quota: number;
  used_today: number;
  created_at: string;
}

export interface GatewayKeyCreated extends GatewayKey {
  plain_key: string;
}

export interface GatewayKeyVerifyResponse {
  verified: boolean;
  label: string | null;
  allowed_functions: string[];
}
