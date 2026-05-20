export interface Subscription {
  id: string;
  plan_id: string;
  plan_code: string;
  plan_name: string;
  status: string;
  billing_cycle: string;
  provider: string;
  amount: number | string;
  currency: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  created_at: string;
}

/** Admin projection — includes the owning user denormalised for the
 *  cross-tenant subscriptions table. */
export interface AdminSubscription extends Subscription {
  user_id: string;
  user_email: string;
}
