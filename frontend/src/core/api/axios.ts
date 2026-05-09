import axios from "axios";
import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";

// Note: do NOT pin Content-Type at the instance level. Axios sets it per
// request based on the data type (JSON, FormData, URLSearchParams, etc.).
// A pinned Content-Type would override the multipart boundary axios needs
// to add for FormData uploads, breaking image upload with HTTP 422.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
});

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
