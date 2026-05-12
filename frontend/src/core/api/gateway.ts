import axios from "axios";

/** Axios instance for gatewaygrok-backend.
 *
 *  Same-origin in prod (frontend nginx proxies /gateway-api/* to host:8001),
 *  localhost:8001 in dev. Auth uses the gatewaygrok admin token from the
 *  separate gateway-auth store — NOT the GrokFlow JWT, since gatewaygrok
 *  has its own admin auth flow.
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
  // Read token lazily to avoid the circular import with the auth store.
  if (typeof window !== "undefined") {
    try {
      const persisted = window.localStorage.getItem("gateway-auth");
      if (persisted) {
        const parsed = JSON.parse(persisted);
        const token = parsed?.state?.token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    } catch { /* ignore */ }
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
