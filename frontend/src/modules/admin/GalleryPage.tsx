// Legacy single-page Gallery has been split into 3 sub-pages
// (/gallery/images, /gallery/videos, /gallery/prompts) — see GalleryShell.tsx
// for the shared implementation. This file stays around so any external
// link to `/gallery` still lands somewhere meaningful: send to images.
import { Navigate } from "react-router-dom";

export function GalleryPage() {
  return <Navigate to="/gallery/images" replace />;
}
