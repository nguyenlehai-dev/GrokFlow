/** Theme helpers for `@grokflow/ui` consumers.
 *
 * Core embeds module FE via `<iframe src="/m/<slug>/?theme=...">` or
 * later sends `postMessage({ type: "grokflow:theme", theme: {…} })`. The
 * helpers below apply the theme by setting CSS variables on the document
 * root so the entire @grokflow/ui component tree picks them up without
 * a re-render. */

export interface Theme {
  primary?: string;
  primaryHover?: string;
  primaryFg?: string;
  bg?: string;
  bgMuted?: string;
  fg?: string;
  fgMuted?: string;
  border?: string;
  radius?: string;
  dark?: boolean;
}

const KEY_MAP: Record<keyof Theme, string | null> = {
  primary:      "--gf-primary",
  primaryHover: "--gf-primary-hover",
  primaryFg:    "--gf-primary-fg",
  bg:           "--gf-bg",
  bgMuted:      "--gf-bg-muted",
  fg:           "--gf-fg",
  fgMuted:      "--gf-fg-muted",
  border:       "--gf-border",
  radius:       "--gf-radius",
  dark:         null,   // handled specially
};

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const [k, val] of Object.entries(theme)) {
    const cssVar = KEY_MAP[k as keyof Theme];
    if (cssVar && typeof val === "string") {
      root.style.setProperty(cssVar, val);
    }
  }
  if (typeof theme.dark === "boolean") {
    root.setAttribute("data-gf-theme", theme.dark ? "dark" : "light");
  }
}

/** Listen for postMessage from the parent shell. Modules call this once
 *  near app init; the cleanup function is rarely needed (page lifetime). */
export function listenForThemeMessages(): () => void {
  function onMessage(ev: MessageEvent) {
    if (ev?.data?.type === "grokflow:theme" && ev.data.theme) {
      applyTheme(ev.data.theme as Theme);
    }
  }
  window.addEventListener("message", onMessage);

  // Also accept theme from URL query string on initial load (no JS
  // round-trip): /m/<slug>/?theme=<base64-json>
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("theme");
  if (raw) {
    try {
      const parsed = JSON.parse(atob(raw));
      applyTheme(parsed);
    } catch {
      // ignore malformed theme — defaults kick in
    }
  }

  return () => window.removeEventListener("message", onMessage);
}
