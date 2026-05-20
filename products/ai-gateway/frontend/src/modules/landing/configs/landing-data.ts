/**
 * Static data tables that power the public landing page.
 *
 * Kept separate from the view components so copy / pricing / module
 * catalogue can be edited without scrolling through JSX.
 */
import { Image as ImageIcon, Video, Scissors, Cpu, Disc3 } from "lucide-react";

// ─── Pricing tiers (in sync with backend/entitlements/catalog.py) ──────

export type Tier = {
  code: string;
  name: string;
  priceVnd: number | null;
  priceLabel?: string;
  description: string;
  highlight?: boolean;
  features: string[];
  cta: string;
  ctaTo: string;
};

export const TIERS: Tier[] = [
  {
    code: "free", name: "Free", priceVnd: 0,
    description: "Bắt đầu miễn phí, không cần thẻ",
    features: ["10 job/ngày", "Aspect ratio cơ bản", "1 API key", "Hỗ trợ Discord"],
    cta: "Đăng ký miễn phí", ctaTo: "/register",
  },
  {
    code: "basic", name: "Basic", priceVnd: 199000,
    description: "Cá nhân, freelancer — ảnh + video cơ bản",
    features: ["Image + Video", "Image-to-image", "Full aspect ratios", "Email support"],
    cta: "Lên Basic", ctaTo: "/register?plan=basic",
  },
  {
    code: "pro", name: "Pro", priceVnd: 499000, highlight: true,
    description: "Sản xuất nội dung chuyên nghiệp",
    features: ["Quality mode", "Concurrent jobs", "Webhook", "API key pool", "Priority queue"],
    cta: "Lên Pro · phổ biến", ctaTo: "/register?plan=pro",
  },
  {
    code: "premium", name: "Premium", priceVnd: null, priceLabel: "Tuỳ chỉnh",
    description: "Team / agency — quota cao, SLA, white-label",
    features: ["Unlimited concurrent", "White-label brand", "Dedicated profile pool", "SLA 99.9%"],
    cta: "Liên hệ", ctaTo: "/register?plan=premium",
  },
];

// ─── Module catalog (rendered as album-art cards) ──────────────────────

export type ModuleCard = {
  label: string;
  tagline: string;
  desc: string;
  icon: typeof ImageIcon;
  // Album-art gradient (CSS class). Each module owns its own tone.
  gradient: string;
  ctaText: string;
  to: string;
  features: readonly string[];
  badge?: string;
};

export const MODULES: readonly ModuleCard[] = [
  {
    label: "AI Image", tagline: "Generate · Edit · Stylize",
    desc: "Aurora · Grok-2 · Grok-3 — full aspect ratios, speed/quality mode, image-to-image.",
    icon: ImageIcon,
    // Coral → rose. Warm, the "image" hue corner of our brand.
    gradient: "from-[#ff8a4c] via-[#ff5e8a] to-[#ff3d71]",
    ctaText: "Thử ngay", to: "/try/image",
    badge: "Free",
    features: ["Aurora model", "Image-to-image", "5 tỉ lệ", "Quality mode (Pro)"],
  },
  {
    label: "AI Video", tagline: "Text · Image · Remix",
    desc: "Text-to-video & image-to-video. 480p/720p, 3-15s, fun + custom mode.",
    icon: Video,
    // Rose → lavender. Mid-spectrum, "video" hue.
    gradient: "from-[#ff3d71] via-[#c147e9] to-[#b794f6]",
    ctaText: "Cần Basic+", to: "/register?plan=basic",
    badge: "199k+",
    features: ["Text-to-video", "Image-to-video", "Fun mode", "Đến 15s"],
  },
  {
    label: "Flow Tools", tagline: "Cut · Merge · Resize",
    desc: "Cắt ghép video, đổi tỉ lệ, tách audio. Xử lý local trong browser, không cần Adobe.",
    icon: Scissors,
    // Mint → cyan. Cool corner — "flow" reads as productivity / fresh.
    gradient: "from-[#00e0b4] via-[#2ed3ce] to-[#4fc3f7]",
    ctaText: "Mở trong app", to: "/register",
    features: ["Cut video", "Merge audio", "Resize", "Trích frames"],
  },
  {
    label: "LLM Gateway", tagline: "Route · Pool · Stream",
    desc: "1 API key — auto route OpenAI / Gemini / Claude / Grok. Pool + rotation tự động.",
    icon: Cpu,
    // Lavender → deep indigo. Deepest hue corner — "gateway" reads as
    // infrastructure / serious tooling.
    gradient: "from-[#b794f6] via-[#7c52e0] to-[#4a2fbd]",
    ctaText: "Cần Pro+", to: "/register?plan=pro",
    badge: "v1",
    features: ["Multi-provider", "Key rotation", "Rate limit", "Async + sync"],
  },
];

// ─── App preview (Spotify-style mockup) ────────────────────────────────
// Faux streaming-app shell embedded in the landing page so visitors
// instantly recognise the "music app" framing. Sidebar (Home/Search/
// Library + playlists), main grid (greeting + Recently played tiles +
// Made For You row), and a docked player bar at the bottom of the
// frame.

export const SIDEBAR_PLAYLISTS = [
  "AI Image · Top Picks",
  "Video Mixes",
  "Flow Productivity",
  "Gateway Routing",
  "Aurora favourites",
  "Liked Generations",
  "Weekly Drop",
];

// Aurora palette — coral / rose / lavender / indigo / mint / cyan.
// Each tile owns one hue corner so the grid reads as a curated set
// rather than rainbow noise.
export const QUICK_TILES = [
  { name: "AI Image",       gradient: "from-[#ff8a4c] to-[#ff3d71]" },
  { name: "AI Video",       gradient: "from-[#ff3d71] to-[#c147e9]" },
  { name: "Flow Tools",     gradient: "from-[#00e0b4] to-[#4fc3f7]" },
  { name: "LLM Gateway",    gradient: "from-[#b794f6] to-[#4a2fbd]" },
  { name: "Liked Results",  gradient: "from-[#c147e9] to-[#7c52e0]" },
  { name: "Recent Jobs",    gradient: "from-[#4fc3f7] to-[#4a2fbd]" },
];

export const MADE_FOR_YOU_TILES = [
  { title: "Daily Mix 1", subtitle: "Aurora · Grok-3 · Image",   gradient: "from-[#ff8a4c] via-[#ff3d71] to-[#c147e9]" },
  { title: "Daily Mix 2", subtitle: "Cinematic video · 4:5",     gradient: "from-[#ff6b6b] via-[#c147e9] to-[#4a2fbd]" },
  { title: "Daily Mix 3", subtitle: "GPT-4o · Claude · Gemini",  gradient: "from-[#4a2fbd] via-[#4fc3f7] to-[#00e0b4]" },
  { title: "Daily Mix 4", subtitle: "Flow · Cut · Merge",        gradient: "from-[#00e0b4] via-[#4fc3f7] to-[#b794f6]" },
];

// ─── Genre pills ───────────────────────────────────────────────────────

export const GENRES = [
  { label: "Photorealistic", gradient: "from-violet-600 to-fuchsia-600" },
  { label: "Anime",          gradient: "from-pink-500 to-rose-500" },
  { label: "Cinematic",      gradient: "from-amber-500 to-orange-500" },
  { label: "3D Render",      gradient: "from-cyan-500 to-indigo-500" },
  { label: "Logo / Brand",   gradient: "from-emerald-500 to-teal-500" },
  { label: "Short clip",     gradient: "from-purple-600 to-blue-500" },
  { label: "Voice clone",    gradient: "from-rose-600 to-amber-400" },
  { label: "Lipsync",        gradient: "from-indigo-600 to-fuchsia-500" },
  { label: "Music video",    gradient: "from-orange-500 to-pink-500" },
  { label: "Documentary",    gradient: "from-teal-500 to-emerald-400" },
];

// ─── Horizontal playlist carousel (Spotify-style) ──────────────────────

export type PlaylistTile = {
  title: string;
  subtitle: string;
  gradient: string;
  icon?: typeof Disc3;
};

export const MADE_FOR_YOU: PlaylistTile[] = [
  { title: "Daily Mix 1",     subtitle: "Aurora · photorealism",        gradient: "from-[#ff8a4c] via-[#ff3d71] to-[#c147e9]" },
  { title: "Daily Mix 2",     subtitle: "Cinematic 4:5 video",          gradient: "from-[#ff6b6b] via-[#c147e9] to-[#4a2fbd]" },
  { title: "Daily Mix 3",     subtitle: "LLM gateway · multi-route",    gradient: "from-[#4a2fbd] via-[#4fc3f7] to-[#00e0b4]" },
  { title: "Daily Mix 4",     subtitle: "Flow productivity",            gradient: "from-[#00e0b4] via-[#4fc3f7] to-[#b794f6]" },
  { title: "Discover Weekly", subtitle: "Aurora drops + remix",         gradient: "from-[#b794f6] via-[#c147e9] to-[#ff3d71]" },
  { title: "Release Radar",   subtitle: "Models phát hành tuần này",    gradient: "from-[#ff8a4c] via-[#ff3d71] to-[#4a2fbd]" },
];

export const TRENDING: PlaylistTile[] = [
  { title: "Brand campaign", subtitle: "Logo · poster · banner",  gradient: "from-[#ff8a4c] to-[#c147e9]" },
  { title: "TikTok shorts",  subtitle: "image-to-video · 15s",    gradient: "from-[#ff3d71] to-[#b794f6]" },
  { title: "E-commerce",     subtitle: "Product photoreal",       gradient: "from-[#ff8a4c] to-[#ff3d71]" },
  { title: "AI Avatar",      subtitle: "Talking head + voice",    gradient: "from-[#4fc3f7] to-[#4a2fbd]" },
  { title: "Storyboard",     subtitle: "Concept → final frame",   gradient: "from-[#c147e9] to-[#ff3d71]" },
  { title: "Music cover",    subtitle: "Album art · cover photo", gradient: "from-[#00e0b4] to-[#4fc3f7]" },
];
