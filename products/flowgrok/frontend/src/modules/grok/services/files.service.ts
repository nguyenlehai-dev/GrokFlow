import { api } from "@/core/api/axios";

/** Authed blob fetch — `<img>` / `<video>` can't send Authorization
 *  headers, so we pull binary through axios (which attaches the JWT)
 *  and the caller converts to an object URL.
 *
 *  Returns an axios-like response with `data: Blob` plus `headers` so
 *  callers can sniff `content-type` if the blob's own `.type` is empty.
 */
export const filesService = {
  downloadBlob: (url: string) => api.get(url, { responseType: "blob" }),
};
