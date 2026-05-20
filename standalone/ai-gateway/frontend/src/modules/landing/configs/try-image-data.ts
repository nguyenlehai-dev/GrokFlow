/**
 * Static config + content tables for the public "Try Image" page.
 */

export const ASPECTS = [
  { v: "1:1",  label: "Vuông",  icon: "■" },
  { v: "16:9", label: "Ngang",  icon: "▭" },
  { v: "9:16", label: "Dọc",    icon: "▯" },
  { v: "4:3",  label: "4:3",    icon: "▭" },
  { v: "3:4",  label: "3:4",    icon: "▯" },
];

// Curated starter prompts. Click → fills the prompt field so first-time
// visitors don't bounce on empty-state paralysis.
export const PROMPT_EXAMPLES = [
  {
    emoji: "🐉",
    label: "Rồng + Vịnh Hạ Long",
    prompt: "A majestic dragon flying over Ha Long Bay at golden sunset, watercolor style, cinematic lighting, ultra detailed",
  },
  {
    emoji: "🌆",
    label: "Cyberpunk Saigon",
    prompt: "Cyberpunk Saigon street at night, neon lights reflecting on wet pavement, motorbikes blurring past, photorealistic 8k",
  },
  {
    emoji: "🎨",
    label: "Chân dung anime",
    prompt: "Anime portrait of a young Vietnamese girl wearing áo dài in cherry blossom garden, soft studio lighting, Makoto Shinkai style",
  },
  {
    emoji: "🏯",
    label: "Đền cổ trong rừng",
    prompt: "Ancient Vietnamese temple hidden in misty jungle, dawn light filtering through trees, mossy stone steps, atmospheric photography",
  },
  {
    emoji: "🍜",
    label: "Phở nghệ thuật",
    prompt: "Hyperrealistic bowl of phở with steam rising, dramatic side lighting, food photography, shallow depth of field, professional",
  },
  {
    emoji: "🚀",
    label: "Phi hành gia surfer",
    prompt: "An astronaut surfing on a cosmic wave through purple nebula, retro 80s synthwave aesthetic, vibrant colors, poster art",
  },
];

export const STORAGE_HISTORY_KEY = "grokflow:try-image:history";
export const MAX_HISTORY = 6;
