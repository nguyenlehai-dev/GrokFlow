import { useState } from "react";
import { useForm } from "react-hook-form";
import { LogIn, Network, AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useGatewayAuthStore } from "@/core/auth/gateway-store";

/** Forces a gatewaygrok admin login before rendering any gateway page. */
export function GatewayAuthGuard({ children }: { children: ReactNode }) {
  const isValid = useGatewayAuthStore((s) => s.isValid)();
  if (!isValid) return <GatewayLogin />;
  return <>{children}</>;
}

function GatewayLogin() {
  const login = useGatewayAuthStore((s) => s.login);
  const [error, setError] = useState<string | null>(null);
  const {
    register, handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ username: string; password: string }>({
    defaultValues: { username: "admin", password: "" },
  });

  const onSubmit = async (v: { username: string; password: string }) => {
    setError(null);
    try {
      await login(v.username, v.password);
    } catch (e: any) {
      setError(
        e?.response?.data?.detail ??
        e?.response?.data?.message ??
        e?.message ??
        "Login failed",
      );
    }
  };

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Network size={22} /> Gateway Admin Login
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Đăng nhập gatewaygrok-backend. Credentials cấu hình ở
          {" "}<code>GATEWAY_ADMIN_USERNAME</code> + <code>GATEWAY_ADMIN_PASSWORD</code>
          {" "}trong <code>.env</code> của gateway repo.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-3">
        <div>
          <label className="text-sm font-medium">Username</label>
          <input className="input" {...register("username", { required: true })} />
        </div>
        <div>
          <label className="text-sm font-medium">Password</label>
          <input
            className="input"
            type="password"
            {...register("password", { required: true })}
          />
        </div>
        {error && (
          <div className="flex items-start gap-2 text-sm text-rose-600">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full inline-flex items-center justify-center gap-1.5"
        >
          <LogIn size={14} />
          {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập Gateway"}
        </button>
      </form>
    </div>
  );
}
