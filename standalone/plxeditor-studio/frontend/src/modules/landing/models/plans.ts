export interface PublicPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_default: boolean;
  price_vnd: number | null;
  price_usd_cents: number | null;
  entitlements: {
    features?: Record<string, boolean>;
    limits?: Record<string, number>;
  };
}
