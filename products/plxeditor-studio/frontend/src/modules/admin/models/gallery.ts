export interface GalleryItem {
  job_id: string;
  job_type: "image" | "video";
  provider: string;
  prompt: string;
  result_url: string;
  profile_name: string | null;
  user_email: string | null;
  domain_id: string | null;
  domain_hostname: string | null;
  domain_brand_name: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface GalleryPageOut {
  items: GalleryItem[];
  total: number;
  offset: number;
  limit: number;
}

export interface GalleryDomainOption {
  id: string;
  hostname: string;
  brand_name: string | null;
}
