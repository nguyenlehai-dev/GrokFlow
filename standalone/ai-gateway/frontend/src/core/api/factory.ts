import axios, { AxiosInstance } from "axios";

import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";
import { installRetryInterceptor } from "./retry";

/** Build a fresh axios instance that:
 *   - prefixes every request with `baseURL` (empty = same-origin)
 *   - injects the GrokFlow JWT on every request
 *   - on 401 outside /login: clears auth + redirects to /login
 *   - on 4xx/5xx with `detail.message`: surfaces it as a toast
 *
 *  Modules use this when their BE lives at a different host:
 *
 *    // modules/grok/api.ts
 *    import { createHttp } from "@/core/api/factory";
 *    import { moduleManifest } from ".";
 *    export const grokApi = createHttp(moduleManifest.apiBaseUrl);
 *
 *  Same-origin modules can keep using `core/api/axios` (the default
 *  instance), but going through this factory makes "swap the BE host
 *  later" a one-line change.
 */
export function createHttp(baseURL: string = ""): AxiosInstance {
  const http = axios.create({ baseURL });

  // Install retry BEFORE the toast handler — same ordering rationale as
  // in core/api/axios.ts. Without this, every transient 502 during a
  // deploy fires a "Lỗi máy chủ" toast on every retry attempt.
  installRetryInterceptor(http);

  http.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // FormData must keep its own multipart boundary — axios sets it.
    if (
      config.data &&
      !(config.data instanceof FormData) &&
      !config.headers["Content-Type"]
    ) {
      config.headers["Content-Type"] = "application/json";
    }
    return config;
  });

  http.interceptors.response.use(
    (r) => r,
    (err) => {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      if (status === 401 && !location.pathname.startsWith("/login")) {
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

  return http;
}
