/** Optional Tailwind preset for `@grokflow/ui` consumers.
 *
 * Modules that use Tailwind can include this preset to get the same
 * design tokens as core. Modules NOT using Tailwind ignore this file —
 * components still render correctly via CSS variables.
 *
 * Usage in module's tailwind.config.js:
 *   module.exports = {
 *     presets: [require("@grokflow/ui/tailwind-preset")],
 *     content: ["./src/**\/*.{ts,tsx}"],
 *   }
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        "gf-primary": "var(--gf-primary)",
        "gf-bg": "var(--gf-bg)",
        "gf-fg": "var(--gf-fg)",
        "gf-border": "var(--gf-border)",
        "gf-success": "var(--gf-success)",
        "gf-warning": "var(--gf-warning)",
        "gf-danger": "var(--gf-danger)",
      },
      borderRadius: {
        gf: "var(--gf-radius)",
      },
      fontFamily: {
        gf: "var(--gf-font)",
      },
    },
  },
};
