import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

// When core embeds the iframe it passes a `theme` URL param (base64-encoded
// JSON of CSS variable overrides — primary colour, bg, fg, radius, etc.)
// Apply them on first render so the module's look matches the host shell.
// Modules that don't care about theming can ignore this.
const params = new URLSearchParams(window.location.search);
const themeRaw = params.get("theme");
if (themeRaw) {
  try {
    const t = JSON.parse(atob(themeRaw));
    for (const [k, v] of Object.entries(t)) {
      if (typeof v === "string") {
        document.documentElement.style.setProperty(`--gf-${k}`, v);
      }
    }
  } catch {
    /* malformed theme — defaults apply */
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
