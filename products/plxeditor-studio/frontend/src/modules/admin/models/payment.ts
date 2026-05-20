export interface Payment {
  id: string;
  subscription_id: string | null;
  amount: number | string;
  currency: string;
  status: string;
  provider: string;
  payment_method: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface AdminPayment extends Payment {
  user_id: string;
  user_email: string;
  provider_payment_id: string | null;
}
