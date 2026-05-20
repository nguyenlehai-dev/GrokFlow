import { api } from "@/core/api/axios";

export interface GatewayGalleryItem {
  gw_id: string;
  vendor_code: string | null;
  vendor_name: string | null;
  function_code: string | null;
  model: string | null;
  response_excerpt: string | null;
  latency_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_cents: number | null;
  domain_id: string | null;
  domain_hostname: string | null;
  domain_brand_name: string | null;
  created_at: string;
}

export interface GatewayGalleryPage {
  items: GatewayGalleryItem[];
  total: number;
  offset: number;
  limit: number;
}

export const galleryGatewayService = {
  list: (params: {
    vendor_code?: string;
    function_code?: string;
    domain_id?: string;
    offset?: number;
    limit?: number;
  } = {}) =>
    api
      .get<GatewayGalleryPage>("/api/gallery/gateway", { params })
      .then((r) => r.data),
};
