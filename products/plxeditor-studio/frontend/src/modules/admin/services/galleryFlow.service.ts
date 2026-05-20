import { api } from "@/core/api/axios";

export interface FlowGalleryItem {
  job_id: string;
  operation: string;
  output_kind: "video" | "audio" | "frame";
  output_url: string | null;
  output_filename: string | null;
  file_size: number | null;
  duration: number | null;
  user_email: string | null;
  domain_id: string | null;
  domain_hostname: string | null;
  domain_brand_name: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface FlowGalleryPage {
  items: FlowGalleryItem[];
  total: number;
  offset: number;
  limit: number;
}

export const galleryFlowService = {
  list: (params: {
    output_kind?: "video" | "audio" | "frame" | "";
    operation?: string;
    domain_id?: string;
    offset?: number;
    limit?: number;
  } = {}) =>
    api
      .get<FlowGalleryPage>("/api/gallery/flow", { params })
      .then((r) => r.data),
};
