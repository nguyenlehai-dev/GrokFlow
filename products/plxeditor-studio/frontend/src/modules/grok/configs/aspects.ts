/** Aspect ratio catalog for image/video jobs.
 *
 *  Used by:
 *   - CreateJobModal — full list with display labels.
 *   - GrokPlaygroundPage — slim list (no extras like 3:2 / 2:3).
 *
 *  `SIZES_FROM_ASPECT` maps a display aspect to the concrete pixel size
 *  the backend uses (`size` field). Kept here so both call-sites stay
 *  in sync.
 */

export interface AspectOption {
  v: string;
  label: string;
}

export const ASPECT_OPTIONS: AspectOption[] = [
  { v: "1:1",  label: "1:1 Square" },
  { v: "16:9", label: "16:9 Landscape" },
  { v: "9:16", label: "9:16 Portrait" },
  { v: "4:3",  label: "4:3" },
  { v: "3:4",  label: "3:4" },
  { v: "3:2",  label: "3:2" },
  { v: "2:3",  label: "2:3" },
];

/** Slim list — Playground only exposes these. */
export const PLAYGROUND_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4"];

export const QUALITIES = ["speed", "quality"];

export const SIZES_FROM_ASPECT: Record<string, string> = {
  "1:1":  "1024x1024",
  "16:9": "1024x576",
  "9:16": "576x1024",
  "4:3":  "1024x768",
  "3:4":  "768x1024",
  "3:2":  "1080x720",
  "2:3":  "720x1080",
};
