import axios from "axios";
import { useAuthStore } from "@/core/auth/store";
import { installRetryInterceptor } from "./retry";

/** Gateway API client.
 *
 *  Same-origin in production. Hits /api/gateway-proxy/* on the GrokFlow
 *  backend, which validates the GrokFlow JWT (admin role) and forwards
 *  the request to gatewaygrok-backend with a cached admin token. The
 *  user never sees a second login.
 *
 *  Dev fallback (localhost): default to localhost:8000 (GrokFlow backend),
 *  same proxy path. Set VITE_GATEWAY_API_BASE_URL to override if your dev
 *  topology is different.
 */
const onLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

const baseURL = onLocalhost
  ? (import.meta.env.VITE_GATEWAY_API_BASE_URL || "http://localhost:8000/api/gateway-proxy")
  : "/api/gateway-proxy";

export const gatewayApi = axios.create({ baseURL });

// Retry 502/503/504 during backend redeploys so admin UI doesn't show
// errors during the ~10s container swap window.
installRetryInterceptor(gatewayApi);

gatewayApi.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (
    config.data &&
    !(config.data instanceof FormData) &&
    !config.headers["Content-Type"]
  ) {
    config.headers["Content-Type"] = "application/json";
  }
  return config;
});
