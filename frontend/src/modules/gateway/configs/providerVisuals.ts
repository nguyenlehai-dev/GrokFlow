export type Category = "grok" | "flow" | "dreamina";

export const providerVisuals: Record<
  Category,
  { label: string; image: string; accent: string; surface: string }
> = {
  grok: {
    label: "Grok",
    image: "https://www.google.com/s2/favicons?domain=grok.com&sz=128",
    accent: "#0fb9b1",
    surface: "#0d2a2e",
  },
  flow: {
    label: "Flow",
    image: "https://www.google.com/s2/favicons?domain=labs.google&sz=128",
    accent: "#ffb020",
    surface: "#35260b",
  },
  dreamina: {
    label: "Dreamina",
    image: "https://www.google.com/s2/favicons?domain=dreamina.capcut.com&sz=128",
    accent: "#ff6b6b",
    surface: "#351718",
  },
};

export type SessionCheckRecord = {
  provider: string;
  state: string;
  start_url: string;
  page_url: string;
  title: string;
  screenshot_path: string;
  cookie_present: boolean;
  live_browser_connected: boolean;
  requires_live_browser: boolean;
  indicators: string[];
  summary: string;
  body_preview: string;
  screenshot_data_url?: string | null;
};
