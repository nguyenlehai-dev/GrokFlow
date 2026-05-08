import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";

interface FormValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const { token, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<FormValues>();

  if (token) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const { data } = await api.post("/api/auth/login", values);
      const me = await api.get("/api/auth/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      setAuth(data.access_token, me.data);
      navigate("/dashboard");
    } catch (e: any) {
      setError(e?.response?.data?.detail?.message ?? "Login failed");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm card space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-brand-600">GrokFlow</h1>
          <p className="text-sm text-slate-500">Đăng nhập để tiếp tục</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <input className="input" type="email" autoComplete="username" {...register("email", { required: true })} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Mật khẩu</label>
          <input className="input" type="password" autoComplete="current-password" {...register("password", { required: true })} />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
    </div>
  );
}
