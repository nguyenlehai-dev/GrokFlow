import { SIZES_FROM_ASPECT } from "../configs/aspects";

/** Resolve a display aspect (e.g. "16:9") to a backend pixel size
 *  (e.g. "1024x576"). Falls back to a square if the aspect is unknown,
 *  matching the previous inline Playground behaviour. */
export function aspectToSize(aspect: string): string {
  return SIZES_FROM_ASPECT[aspect] || "1024x1024";
}
