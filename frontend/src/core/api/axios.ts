import axios from "axios";
import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";
import { installRetryInterceptor } from "./retry";

// Note: do NOT pin Content-Type at the instance level. Axios sets it per
// request based on the data type (JSON, FormData, URLSearchParams, etc.).
// A pinned Content-Type would override the multipart boundary axios needs
// to add for FormData uploads, breaking image upload with HTTP 422.

// baseURL resolution:
//   - Same-origin (empty string) when running in a browser on anything
//     other than localhost — each domain's host-nginx vhost proxies /api/*
//     to the backend container, so no CORS and no hardcoded host is needed.
//     This is what makes multi-domain per-user-domain access control work.
//   - Falls back to VITE_API_BASE_URL (or localhost:8000) when on localhost
//     so `npm run dev` against a local backend keeps working.
const onLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

const baseURL = onLocalhost
  ? (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000")
  : "";

export const api = axios.create({
  baseURL,
});

// Install retry FIRST so it sees errors before the toast handler. Without
// this ordering, every retry attempt would surface a "Lỗi máy chủ" toast
// on the way to a successful retry. With retry first, intermediate 502s
// are silently swallowed; only the final exhausted-retries error reaches
// the toast handler below.
installRetryInterceptor(api);

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Default to JSON for non-FormData bodies. FormData triggers axios's own
  // multipart serializer which sets the boundary header itself.
  if (
    config.data &&
    !(config.data instanceof FormData) &&
    !config.headers["Content-Type"]
  ) {
    config.headers["Content-Type"] = "application/json";
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err.response?.status;
    const detail = err.response?.data?.detail;
    const code = detail?.code;
    const url: string = err.config?.url ?? "";
    // 401 = token gone bad. 403 with a scope-mismatch code on /me means
    // the user's tool/domain scope is incompatible with where they're
    // calling from (e.g. tool user in browser, or web user in desktop).
    // Both end the same way: clear local auth + bounce to /login so
    // they re-authenticate from a valid surface.
    const scopeMismatch =
      status === 403 && url.includes("/api/auth/me") && (
        code === "wrong_scope_tool_user"
        || code === "wrong_scope_domain_user"
        || code === "wrong_tool_install"
      );
    if ((status === 401 || scopeMismatch) && !location.pathname.startsWith("/login")) {
      useAuthStore.getState().clear();
      location.href = "/login";
    } else if (status && status >= 400 && detail?.message) {
      toast(detail.message, "error");
    } else if (status && status >= 500) {
      toast("Lỗi máy chủ, thử lại sau.", "error");
    }
    return Promise.reject(err);
  },
);
