import { useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { Mail, Lock, User, ArrowRight, Sparkles, Check } from "lucide-react";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";

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
  const brandName = useDomainStore((s) => s.config?.brand_name) ?? "GrokFlow";
  const firstAllowedPath = useDomainStore((s) => s.firstAllowedPath);

  if (token) return <Navigate to={firstAllowedPath()} replace />;

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
      const target = (me.data?.role === "admin" || me.data?.role === "super_admin") ? "/dashboard" : firstAllowedPath();
      navigate(target);
    } catch (e: any) {
      setError(e?.response?.data?.detail?.message ?? "Đăng ký thất bại");
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-mesh">
      {/* Left art panel — mirrors LoginPage but pitches the free trial. */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-brand">
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-accent-cyan/30 blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-accent-fuchsia/20 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <Link to="/" className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center font-bold text-xl">
              {brandName[0]}
            </span>
            <span className="font-bold text-2xl">{brandName}</span>
          </Link>

          <div className="space-y-8">
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-white/15 text-xs font-semibold tracking-wider uppercase">
                Free forever — không cần thẻ
              </span>
              <h2 className="mt-4 text-4xl font-bold leading-tight">
                Bắt đầu trong<br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-100 to-white">
                  30 giây.
                </span>
              </h2>
              <p className="mt-4 text-white/80 text-lg max-w-md">
                Tài khoản miễn phí đã có 50 image/tháng. Cần thêm thì lên Pro bất kỳ lúc nào.
              </p>
            </div>

            <ul className="space-y-3">
              {[
                "50 image/tháng — Aurora model",
                "Public API key, swap providers tự động",
                "Không lock-in, hủy bất kỳ lúc nào",
                "Hỗ trợ tiếng Việt, server VN",
              ].map((text) => (
                <li key={text} className="flex items-center gap-3 text-white/90">
                  <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Check size={14} />
                  </span>
                  <span className="text-sm">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/60">
            © {new Date().getFullYear()} {brandName}.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        <div className="w-full max-w-sm space-y-5 animate-fade-in py-8">
          <div className="lg:hidden text-center space-y-2">
            <div className="inline-flex w-12 h-12 rounded-xl bg-gradient-brand text-white items-center justify-center font-bold text-xl shadow-brand">
              {brandName[0]}
            </div>
            <h1 className="font-bold text-xl text-ink-900">{brandName}</h1>
          </div>

          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-ink-900">
              Tạo tài khoản <span className="text-gradient">miễn phí</span>
            </h1>
            <p className="text-sm text-ink-500">Bắt đầu generate ảnh chỉ trong 30 giây</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-700 uppercase tracking-wider">Họ tên <span className="text-ink-400 normal-case font-normal">(tùy chọn)</span></label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Nguyễn Văn A"
                  className="input pl-10"
                  {...register("full_name", { maxLength: 255 })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-700 uppercase tracking-wider">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="input pl-10"
                  {...register("email", { required: "Email bắt buộc" })}
                />
              </div>
              {errors.email && <p className="text-xs text-rose-600">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-700 uppercase tracking-wider">Mật khẩu</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Tối thiểu 8 ký tự"
                  className="input pl-10"
                  {...register("password", {
                    required: "Mật khẩu bắt buộc",
                    minLength: { value: 8, message: "Tối thiểu 8 ký tự" },
                    maxLength: { value: 128, message: "Tối đa 128 ký tự" },
                  })}
                />
              </div>
              {errors.password && <p className="text-xs text-rose-600">{errors.password.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-700 uppercase tracking-wider">Xác nhận mật khẩu</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Nhập lại mật khẩu"
                  className="input pl-10"
                  {...register("password_confirm", {
                    required: "Vui lòng nhập lại mật khẩu",
                    validate: (v) => v === passwordValue || "Không khớp",
                  })}
                />
              </div>
              {errors.password_confirm && (
                <p className="text-xs text-rose-600">{errors.password_confirm.message}</p>
              )}
            </div>

            {error && (
              <div className="alert-danger animate-slide-up">
                <span className="text-sm">{error}</span>
              </div>
            )}

            <button className="btn-primary w-full btn-lg" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Sparkles size={18} className="animate-pulse" />
                  Đang tạo tài khoản...
                </>
              ) : (
                <>
                  Đăng ký miễn phí
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <p className="text-xs text-ink-500 text-center">
            Khi đăng ký, bạn đồng ý với{" "}
            <a href="/terms" className="font-medium text-ink-700 hover:text-brand-700">Điều khoản</a>{" "}và{" "}
            <a href="/privacy" className="font-medium text-ink-700 hover:text-brand-700">Bảo mật</a>.
          </p>

          <p className="text-sm text-center text-ink-500">
            Đã có tài khoản?{" "}
            <Link to="/login" className="font-semibold text-gradient hover:underline">
              Đăng nhập
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
