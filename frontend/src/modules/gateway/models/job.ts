/** Browser-automation job (/api/jobs on gateway-proxy). */
export interface Job {
  id: string;
  profile_id: string;
  target: string;
  prompt: string;
  negative_prompt: string | null;
  count: number;
  status: string;
  provider_payload: any;
  result_payload: any;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
