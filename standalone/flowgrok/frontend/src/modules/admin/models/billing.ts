import type { Subscription } from "./subscription";
import type { Payment } from "./payment";
import type { Invoice } from "./invoice";

/** Aggregated billing view returned by /api/billing/me — used on the
 *  personal Billing page to render current sub + pending + history. */
export interface BillingSummary {
  current_subscription: Subscription | null;
  pending_subscriptions: Subscription[];
  recent_payments: Payment[];
  recent_invoices: Invoice[];
}

export interface CheckoutResp {
  subscription_id: string;
  payment_id: string;
  invoice_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  payment_url: string | null;
  instructions: string;
}
