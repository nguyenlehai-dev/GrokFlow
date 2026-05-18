import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // /api/* is the module's own BE (in dev, docker-compose.dev.yml
      // exposes it on host 8001). In prod inside the iframe, nginx
      // rewrites /m/<slug>/api/* → BE container so this proxy isn't used.
      "/api": "http://localhost:8001",
    },
  },
});
