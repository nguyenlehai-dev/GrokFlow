import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Allow any hostname so per-domain branding works for new customer hosts
    // without having to redeploy. Dev server only — prod uses nginx.
    allowedHosts: true,
  },
});
