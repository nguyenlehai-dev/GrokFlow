import { api } from "@/core/api/axios";

import type { GalleryPageOut } from "../models/gallery";

export const galleryService = {
  list: (params: Record<string, string | number>) =>
    api.get<GalleryPageOut>("/api/gallery", { params }).then((r) => r.data),
};
