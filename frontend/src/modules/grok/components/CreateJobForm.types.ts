export interface CreateJobForm {
  provider: "grok" | "flow";
  job_type: "image" | "video";
  profile_id: string;
  prompt: string;
  size: string;
  model: string;
  style: string;
  n: number;
  seed: number | null;
  // Shared
  aspect: string;
  // Image-only
  quality: "speed" | "quality";
  // Video-only — Grok video toggles match the live UI exactly:
  //   Resolution: 480p | 720p
  //   Duration:   6s   | 10s
  resolution: "480p" | "720p";
  duration: number;
  mode: "normal" | "fun" | "custom" | "spicy";
}
