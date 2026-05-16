/** API key issued by the browser-automation gateway (/api/api-keys). */
export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  rate_limit_per_minute: number;
  is_active: boolean;
  allowed_categories: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyCreated extends ApiKey {
  plain_key: string;
}
