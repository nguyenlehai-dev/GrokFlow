import axios from "axios";
import { useAuthStore } from "@/core/auth/store";
import { toast } from "@/components/ui/Toast";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
