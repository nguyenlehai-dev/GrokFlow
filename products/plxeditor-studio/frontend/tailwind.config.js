/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",  // we toggle by adding `dark` to <html>
  theme: {
    extend: {
      fontFamily: {
        // Two-font pairing: Space Grotesk gives display type a geometric,
        // distinctive character (vs generic Inter-only SaaS); Inter
        // handles body/UI; JetBrains Mono for code.
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["'Space Grotesk'", "Inter", "ui-sans-serif", "system-ui"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Brand spine — "Aurora coral" (#FF8A4C). Warm, distinctive,
        // owned. Sits between orange and pink; reads as energy +
        // creativity for an AI generation platform without copying
        // Spotify green or generic SaaS blue.
        brand: {
          50:  "#fff4ee",
          100: "#ffe5d3",
          200: "#ffc6a3",
          300: "#ffa570",
          400: "#ff8a4c",
          500: "#ff6b2c",
          600: "#ef5311",
          700: "#c63d0a",
          800: "#9c2f0a",
          900: "#7a260c",
        },
        // Signature accents — mint + lavender pair the warm coral.
        // Triadic harmony, intentionally NOT music-app brand colours.
        accent: {
          coral:    "#ff8a4c",  // = brand-400 (primary CTA tint)
          mint:     "#00e0b4",  // electric mint — success / "live" pulse
          lavender: "#b794f6",  // tertiary highlight
          magenta:  "#c147e9",  // mid-stop in hero gradient
          indigo:   "#4a2fbd",  // deep hero end-stop
          // Legacy aliases kept so unrelated module pages don't break.
          // Re-pointed to the new palette.
          spotify:  "#00e0b4",  // → now reads as mint, not Spotify green
          fuchsia:  "#c147e9",  // → magenta
          cyan:     "#4fc3f7",
          rose:     "#ff6b6b",
          amber:    "#ffb547",
          emerald:  "#00e0b4",
        },
        // Navy-tinted neutrals — distinct from pure-black streaming
        // apps. ink-950 has a subtle blue undertone so the UI reads
        // "software / studio" rather than "media player".
        ink: {
          50:  "#f5f7fb",
          100: "#e6eaf3",
          200: "#c5cce0",
          300: "#9ba3b8",
          400: "#6b7390",
          500: "#4e5571",
          600: "#363c54",
          700: "#262b3d",
          800: "#1c2236",
          900: "#141826",
          950: "#0b0d17",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        // Aurora signature — 3-stop warm→cool. Coral → magenta →
        // indigo. Distinctive vs every 2-stop streaming-app gradient.
        "gradient-aurora": "linear-gradient(135deg, #ff6b6b 0%, #c147e9 50%, #4a2fbd 100%)",
        "gradient-aurora-soft": "linear-gradient(135deg, #ff8a4c 0%, #c147e9 60%, #4a2fbd 100%)",
        // Per-module gradients — each owns a hue corner so modules
        // read as distinct "albums".
        "gradient-image":   "linear-gradient(135deg, #ff8a4c 0%, #ff3d71 100%)",
        "gradient-video":   "linear-gradient(135deg, #ff3d71 0%, #b794f6 100%)",
        "gradient-flow":    "linear-gradient(135deg, #00e0b4 0%, #4fc3f7 100%)",
        "gradient-gateway": "linear-gradient(135deg, #b794f6 0%, #4a2fbd 100%)",
        // Legacy aliases — repointed to the new system so older
        // components using these tokens stay on-brand.
        "gradient-brand":      "linear-gradient(135deg, #ff8a4c 0%, #c147e9 100%)",
        "gradient-brand-cyan": "linear-gradient(135deg, #4a2fbd 0%, #4fc3f7 100%)",
        "gradient-album":      "linear-gradient(135deg, #ff6b6b 0%, #c147e9 50%, #4a2fbd 100%)",
        "gradient-album-cool": "linear-gradient(135deg, #4a2fbd 0%, #4fc3f7 70%, #00e0b4 100%)",
        "gradient-mesh-dark":
          "radial-gradient(at 0% 0%, rgba(255,138,76,0.16) 0px, transparent 50%), " +
          "radial-gradient(at 100% 0%, rgba(193,71,233,0.14) 0px, transparent 50%), " +
          "radial-gradient(at 50% 100%, rgba(0,224,180,0.10) 0px, transparent 50%)",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.06)",
        "card-hover": "0 8px 24px -8px rgba(15, 23, 42, 0.12), 0 4px 12px -4px rgba(15, 23, 42, 0.08)",
        "card-dark": "0 1px 2px 0 rgba(0, 0, 0, 0.4), 0 4px 8px -2px rgba(0, 0, 0, 0.3)",
        "card-dark-hover": "0 8px 24px -8px rgba(0, 0, 0, 0.55), 0 4px 16px -4px rgba(139, 92, 246, 0.25)",
        brand: "0 8px 24px -8px rgba(255, 138, 76, 0.45)",
        "brand-lg": "0 16px 32px -12px rgba(255, 138, 76, 0.55)",
        glow: "0 0 0 1px rgba(255, 138, 76, 0.20), 0 8px 28px -8px rgba(255, 138, 76, 0.40)",
        "glow-pink": "0 0 0 1px rgba(193, 71, 233, 0.25), 0 12px 40px -8px rgba(193, 71, 233, 0.45)",
        "glow-cyan": "0 0 0 1px rgba(0, 224, 180, 0.25), 0 12px 40px -8px rgba(0, 224, 180, 0.45)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      animation: {
        "fade-in": "fadeIn 200ms ease-out",
        "slide-up": "slideUp 220ms ease-out",
        "scale-in": "scaleIn 180ms ease-out",
        shimmer: "shimmer 2.2s linear infinite",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
        marquee: "marquee 22s linear infinite",
        // Equalizer bars (used on currently-active items, music-style)
        "eq-bar-1": "eqBar 1.2s ease-in-out infinite",
        "eq-bar-2": "eqBar 0.9s ease-in-out infinite",
        "eq-bar-3": "eqBar 1.4s ease-in-out infinite",
        // Slow gradient pan for hero
        "gradient-pan": "gradientPan 18s linear infinite",
      },
      keyframes: {
        fadeIn:   { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp:  { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        scaleIn:  { "0%": { opacity: "0", transform: "scale(0.96)" }, "100%": { opacity: "1", transform: "scale(1)" } },
        shimmer:  { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        pulseSoft:{ "0%, 100%": { opacity: "1" }, "50%": { opacity: ".75" } },
        marquee:  { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        eqBar:    { "0%, 100%": { transform: "scaleY(0.35)" }, "50%": { transform: "scaleY(1)" } },
        gradientPan: { "0%": { backgroundPosition: "0% 50%" }, "50%": { backgroundPosition: "100% 50%" }, "100%": { backgroundPosition: "0% 50%" } },
      },
    },
  },
  plugins: [],
};
