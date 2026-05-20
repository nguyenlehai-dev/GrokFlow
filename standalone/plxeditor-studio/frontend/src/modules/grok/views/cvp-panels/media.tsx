// Tiny authed media components — wrap `<img>` / `<video>` so they fetch
// the file via axios (with Authorization header) → blob URL → render.
// Needed because plain `<img src="/api/files/.../download">` bypasses the
// axios interceptor and gets 403.

import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import { useAuthedMediaUrl } from "./hooks";

/** Fetch the authed URL as a blob, then open in a new tab. Use this for
 *  "Xem" buttons where a normal `<a href>` would 403 (no JWT header on
 *  plain navigation). */
export async function openAuthed(url: string): Promise<void> {
  try {
    const r = await api.get(url, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(r.data);
    const win = window.open(blobUrl, "_blank");
    // Keep the URL alive for ~5 min then revoke — long enough for the
    // user to load/save it from the new tab.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5 * 60_000);
    if (!win) toast("Trình duyệt chặn popup — cho phép popup để mở", "error");
  } catch (e: any) {
    toast(`Mở file lỗi: ${e?.response?.data?.detail?.message ?? e?.message ?? "unknown"}`, "error");
  }
}

/** Fetch + trigger a download. Filename is derived from the URL's last
 *  segment if not provided. */
export async function downloadAuthed(url: string, filename?: string): Promise<void> {
  try {
    const r = await api.get(url, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename ?? url.split("/").filter(Boolean).pop() ?? "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  } catch (e: any) {
    toast(`Tải lỗi: ${e?.response?.data?.detail?.message ?? e?.message ?? "unknown"}`, "error");
  }
}

export function AuthedImage({
  url, alt = "", className,
}: { url: string | null; alt?: string; className?: string }) {
  const blobUrl = useAuthedMediaUrl(url);
  if (!blobUrl) return null;
  return <img src={blobUrl} alt={alt} className={className} loading="lazy" />;
}

export function AuthedVideo({
  url, className, controls = true, muted = true, poster,
}: {
  url: string | null;
  className?: string;
  controls?: boolean;
  muted?: boolean;
  poster?: string;
}) {
  const blobUrl = useAuthedMediaUrl(url);
  if (!blobUrl) return null;
  return (
    <video
      src={blobUrl}
      className={className}
      controls={controls}
      muted={muted}
      poster={poster}
      preload="metadata"
    />
  );
}
