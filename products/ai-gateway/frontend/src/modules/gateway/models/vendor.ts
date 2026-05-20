export interface Vendor {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  domain: string | null;
  description: string | null;
  status: string;
  created_at: string;
}

/** Lighter projection used by dropdowns (Pools, Playground). */
export interface VendorRef {
  id: string;
  name: string;
  code: string;
}
