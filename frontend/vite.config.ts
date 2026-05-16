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
  // lucide-react has 1,500+ icon files; Vite's default dep-pre-bundling
  // collapses them into one big optimized dep, which then defeats Rollup's
  // tree-shaking in the prod build. Excluding it forces Rollup to walk the
  // real ES modules and shake away unused icons — cuts ~400-600 KB off the
  // final vendor chunk.
  optimizeDeps: {
    exclude: ["lucide-react"],
  },
  build: {
    // Cap individual chunks at 600 KB; warn instead of error so a one-off
    // big chunk doesn't fail CI.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split heavy libraries off the main app chunk so first-paint pulls
        // less JS. React-Query / Zustand / React Router rarely change so
        // they cache long-term in the browser.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          forms: ["react-hook-form", "zod"],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    // Allow any hostname so per-domain branding works for new customer hosts
    // without having to redeploy. Dev server only — prod uses nginx.
    allowedHosts: true,
    // Proxy /api → API host configured via VITE_DEV_API_TARGET (default:
    // local BE on :8000 — start it with `python -m uvicorn app.main:app
    // --port 8000` from backend/). Override the env var to hit the remote
    // VPS BE during integration testing.
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
