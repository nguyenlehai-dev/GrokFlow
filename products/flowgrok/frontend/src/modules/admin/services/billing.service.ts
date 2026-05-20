import { api } from "@/core/api/axios";

import type { BillingSummary, CheckoutResp } from "../models/billing";

export const billingService = {
  /** Aggregated billing summary for the logged-in user — drives the
   *  /billing page (current sub, pending, recent payments / invoices). */
  summary: () =>
    api.get<BillingSummary>("/api/billing/me").then((r) => r.data),

  /** Submit a checkout. Backend creates pending sub + payment + invoice
   *  and returns an instruction blob (manual) or a redirect URL (gateway). */
  checkout: (payload: Record<string, unknown>) =>
    api
      .post<CheckoutResp>("/api/billing/checkout", payload)
      .then((r) => r.data),
};
