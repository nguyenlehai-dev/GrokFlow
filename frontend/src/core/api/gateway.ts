import axios from "axios";
import { useAuthStore } from "@/core/auth/store";

/** Axios instance for gatewaygrok-backend.
 *
 *  Same-origin base — frontend nginx proxies /gateway-api/* to the
 *  gatewaygrok-backend container (port 8001 on the host). Auth uses the
 *  same JWT as GrokFlow for now; the gatewaygrok side validates via its
 *  admin token header. If the API expects a different header, swap the
 *  interceptor here without touching call sites.
 */
const onLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

const baseURL = onLocalhost
  ? (import.meta.env.VITE_GATEWAY_API_BASE_URL || "http://localhost:8001")
  : "/gateway-api";

export const gatewayApi = axios.create({ baseURL });

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
