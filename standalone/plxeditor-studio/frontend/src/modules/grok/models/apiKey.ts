export interface GeneratedKey {
  api_key: string;
  name: string;
}

export interface VerifyKeyResponse {
  verified: boolean;
  label: string | null;
  user_email: string | null;
  allowed_providers: string[] | null;
  allowed_job_types: string[] | null;
  daily_limit: number | null;
  used_today: number | null;
}
