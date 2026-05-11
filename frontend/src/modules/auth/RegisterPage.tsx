import { useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";

interface FormValues {
  email: string;
  password: string;
  password_confirm: string;
  full_name: string;
}

export function RegisterPage() {
  const { token, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register, handleSubmit, watch,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>();

  if (token) return <Navigate to="/dashboard" replace />;

  const passwordValue = watch("password");

  const onSubmit = async (values: FormValues) => {
    setError(null);
    if (values.password !== values.password_confirm) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }
    try {
      const payload = {
        email: values.email,
        password: values.password,
        full_name: values.full_name || null,
      };
      const { data } = await api.post("/api/auth/register", payload);
      const me = await api.get("/api/auth/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      setAuth(data.access_token, me.data);
      navigate("/dashboard");
    } catch (e: any) {
      setError(e?.response?.data?.detail?.message ?? "Đăng ký thất bại");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm card space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-brand-600">GrokFlow</h1>
          <p className="text-sm text-slate-500">Tạo tài khoản miễn phí — bắt đầu trong 30 giây</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Họ tên (tùy chọn)</label>
          <input
            className="input"
            type="text"
            autoComplete="name"
            placeholder="Nguyễn Văn A"
            {...register("full_name", { maxLength: 255 })}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <input
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register("email", { required: "Email bắt buộc" })}
          />
          {errors.email && <p className="text-xs text-rose-600">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Mật khẩu</label>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="Tối thiểu 8 ký tự"
            {...register("password", {
              required: "Mật khẩu bắt buộc",
              minLength: { value: 8, message: "Tối thiểu 8 ký tự" },
              maxLength: { value: 128, message: "Tối đa 128 ký tự" },
            })}
          />
          {errors.password && <p className="text-xs text-rose-600">{errors.password.message}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Xác nhận mật khẩu</label>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            {...register("password_confirm", {
              required: "Vui lòng nhập lại mật khẩu",
              validate: (v) => v === passwordValue || "Không khớp",
            })}
          />
          {errors.password_confirm && (
            <p className="text-xs text-rose-600">{errors.password_confirm.message}</p>
          )}
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? "Đang tạo tài khoản..." : "Đăng ký miễn phí"}
        </button>

        <p className="text-xs text-slate-500 text-center">
          Khi đăng ký, bạn đồng ý với{" "}
          <a href="/terms" className="underline hover:text-slate-700">Điều khoản dịch vụ</a> và{" "}
          <a href="/privacy" className="underline hover:text-slate-700">Chính sách bảo mật</a>.
        </p>

        <p className="text-sm text-center text-slate-500">
          Đã có tài khoản?{" "}
          <Link to="/login" className="text-brand-600 hover:underline font-medium">
            Đăng nhập
          </Link>
        </p>
      </form>
    </div>
  );
}
