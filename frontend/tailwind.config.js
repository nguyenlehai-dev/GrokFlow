/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Primary brand — refreshed from flat blue to vibrant violet so the
        // gradient pairs in components have a consistent anchor. Older
        // call sites that referenced `brand-500`/`brand-600` still work —
        // the scale just rendered in violet now instead of blue.
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
        accent: {
          fuchsia: "#d946ef",
          cyan:    "#06b6d4",
          rose:    "#f43f5e",
          amber:   "#f59e0b",
          emerald: "#10b981",
        },
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
        "gradient-brand": "linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)",
        "gradient-brand-cyan": "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
        "gradient-mesh":
          "radial-gradient(at 0% 0%, #ede9fe 0px, transparent 50%), " +
          "radial-gradient(at 100% 0%, #fce7f3 0px, transparent 50%), " +
          "radial-gradient(at 50% 100%, #cffafe 0px, transparent 50%)",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.06)",
        "card-hover": "0 8px 24px -8px rgba(15, 23, 42, 0.12), 0 4px 12px -4px rgba(15, 23, 42, 0.08)",
        brand: "0 8px 24px -8px rgba(139, 92, 246, 0.5)",
        "brand-lg": "0 16px 32px -12px rgba(139, 92, 246, 0.55)",
        glow: "0 0 0 1px rgba(139, 92, 246, 0.18), 0 8px 28px -8px rgba(139, 92, 246, 0.45)",
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
      },
      keyframes: {
        fadeIn:   { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp:  { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        scaleIn:  { "0%": { opacity: "0", transform: "scale(0.96)" }, "100%": { opacity: "1", transform: "scale(1)" } },
        shimmer:  { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        pulseSoft:{ "0%, 100%": { opacity: "1" }, "50%": { opacity: ".75" } },
      },
    },
  },
  plugins: [],
};
