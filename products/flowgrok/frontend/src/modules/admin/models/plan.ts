export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_default: boolean;
  sort_order: number;
  entitlements: {
    features?: Record<string, boolean>;
    limits?: Record<string, number>;
  };
  created_at: string;
  updated_at: string;
}

/** Plan info served to public (pricing / checkout) — no entitlement
 *  details, just price + identity. */
export interface PublicPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_vnd: number | null;
}
