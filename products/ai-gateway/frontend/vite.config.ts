import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import httpProxy from "http-proxy";

const VNC_ROUTE = /^\/vnc\/([a-f0-9]+)(\/.*)?$/;

// Module marketplace iframe routing. Production nginx handles this via a
// vhost the backend writes at install time; dev runs without nginx so we
// proxy /m/<slug>/api/* → grokflow-mod-<slug>-be:8000 and /m/<slug>/* →
// grokflow-mod-<slug>-fe:80 from the vite dev server. Requires this dev
// container to be on the `grokflow_default` docker network so DNS resolves.
const MODULE_API_ROUTE = /^\/m\/([a-z][a-z0-9_]*)\/api(\/.*)?$/;
const MODULE_FE_ROUTE  = /^\/m\/([a-z][a-z0-9_]*)(\/.*)?$/;

function vncProxyPlugin(): PluginOption {
  return {
    name: "grokflow-vnc-proxy",
    configureServer(server) {
      const proxy = httpProxy.createProxyServer({ changeOrigin: true });
      proxy.on("error", (err, _req, res) => {
        if (res && "writeHead" in res && !res.headersSent) {
          (res as import("http").ServerResponse).writeHead(502);
          (res as import("http").ServerResponse).end(`VNC proxy error: ${err.message}`);
        }
      });
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(VNC_ROUTE);
        if (!m) return next();
        const target = `http://grokflow-vnc-${m[1]}:6901`;
        req.url = m[2] || "/";
        proxy.web(req, res, { target });
      });
      server.httpServer?.on("upgrade", (req, socket, head) => {
        const m = req.url?.match(VNC_ROUTE);
        if (!m) return;
        const target = `http://grokflow-vnc-${m[1]}:6901`;
        req.url = m[2] || "/";
        proxy.ws(req, socket, head, { target });
      });
    },
  };
}

function moduleProxyPlugin(): PluginOption {
  return {
    name: "grokflow-module-proxy",
    configureServer(server) {
      const proxy = httpProxy.createProxyServer({ changeOrigin: true });
      proxy.on("error", (err, _req, res) => {
        if (res && "writeHead" in res && !res.headersSent) {
          (res as import("http").ServerResponse).writeHead(502);
          (res as import("http").ServerResponse).end(`module proxy error: ${err.message}`);
        }
      });
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        // /m/<slug>/api/* → BE — match API path first (longest-prefix wins).
        const a = req.url.match(MODULE_API_ROUTE);
        if (a) {
          req.url = a[2] || "/";
          proxy.web(req, res, { target: `http://grokflow-mod-${a[1]}-be:8000` });
          return;
        }
        const f = req.url.match(MODULE_FE_ROUTE);
        if (f) {
          req.url = f[2] || "/";
          proxy.web(req, res, { target: `http://grokflow-mod-${f[1]}-fe:80` });
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), vncProxyPlugin(), moduleProxyPlugin()],
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
      // /vnc/<short>/ is handled dynamically by the vncProxyPlugin above.
    },
  },
});
