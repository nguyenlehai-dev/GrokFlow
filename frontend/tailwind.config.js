/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",  // we toggle by adding `dark` to <html>
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Brand spine — vibrant violet that anchors the gradients. Stays
        // identical for light/dark; the rest of the page handles tone.
        brand: {
          50:  "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
        },
        // Music-streaming accent set — Spotify green, Apple Music pink,
        // YouTube Music red, Tidal cyan. Used as album-art-inspired tones
        // across the landing + admin dashboards.
        accent: {
          spotify:  "#1db954",  // Spotify-style green
          fuchsia:  "#ff2d92",  // Apple Music pink
          coral:    "#ff5e62",  // Vibrant coral
          cyan:     "#06b6d4",  // Tidal-ish cyan
          rose:     "#f43f5e",
          amber:    "#f59e0b",
          emerald:  "#10b981",
        },
        // Cool neutrals tuned for dark UI. ink-950 is the page background;
        // ink-900 / ink-800 are surfaces; ink-200 / ink-100 are dividers
        // and muted text on dark.
        ink: {
          50:  "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-brand": "linear-gradient(135deg, #8b5cf6 0%, #ff2d92 100%)",
        "gradient-brand-cyan": "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
        // Spotify-ish hero gradient — vibrant magenta → cyan, like the
        // edges of an album cover.
        "gradient-album": "linear-gradient(135deg, #8b5cf6 0%, #ff2d92 45%, #ff5e62 100%)",
        "gradient-album-cool": "linear-gradient(135deg, #6366f1 0%, #06b6d4 70%, #1db954 100%)",
        // Subtle mesh for body — same hues as the gradient but desaturated
        // and very low opacity so cards still pop on top.
        "gradient-mesh":
          "radial-gradient(at 0% 0%, rgba(139,92,246,0.10) 0px, transparent 50%), " +
          "radial-gradient(at 100% 0%, rgba(255,45,146,0.08) 0px, transparent 50%), " +
          "radial-gradient(at 50% 100%, rgba(6,182,212,0.06) 0px, transparent 50%)",
        "gradient-mesh-dark":
          "radial-gradient(at 0% 0%, rgba(139,92,246,0.18) 0px, transparent 50%), " +
          "radial-gradient(at 100% 0%, rgba(255,45,146,0.14) 0px, transparent 50%), " +
          "radial-gradient(at 50% 100%, rgba(6,182,212,0.10) 0px, transparent 50%)",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.06)",
        "card-hover": "0 8px 24px -8px rgba(15, 23, 42, 0.12), 0 4px 12px -4px rgba(15, 23, 42, 0.08)",
        "card-dark": "0 1px 2px 0 rgba(0, 0, 0, 0.4), 0 4px 8px -2px rgba(0, 0, 0, 0.3)",
        "card-dark-hover": "0 8px 24px -8px rgba(0, 0, 0, 0.55), 0 4px 16px -4px rgba(139, 92, 246, 0.25)",
        brand: "0 8px 24px -8px rgba(139, 92, 246, 0.5)",
        "brand-lg": "0 16px 32px -12px rgba(139, 92, 246, 0.55)",
        glow: "0 0 0 1px rgba(139, 92, 246, 0.18), 0 8px 28px -8px rgba(139, 92, 246, 0.45)",
        // Album-art-style glow used on hover for hero / feature cards
        "glow-pink": "0 0 0 1px rgba(255, 45, 146, 0.25), 0 12px 40px -8px rgba(255, 45, 146, 0.45)",
        "glow-cyan": "0 0 0 1px rgba(6, 182, 212, 0.25), 0 12px 40px -8px rgba(6, 182, 212, 0.45)",
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
