import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";

import type { LoginFormValues } from "../models/auth";
import { authService } from "../services/auth.service";
import { LoginLayoutDefault } from "./LoginLayoutDefault";
import { LoginLayoutAdmin } from "./LoginLayoutAdmin";

/** Top-level login page. Picks which layout to render based on:
 *
 *   1. `forceTemplate` prop (set by /admin/login → always "admin"), then
 *   2. The active domain's `login_template` (from /api/domains/config), then
 *   3. "default" if neither resolves.
 *
 *  All variants share the same form state + submit handler — only the
 *  visual shell differs. */
// Derive a human-readable brand from a hostname when no explicit
// `brand_name` is configured. Strips the leftmost subdomain only when
// there are 3+ labels (so `app.foo.com` → `Foo`, `foo.com` stays `Foo`),
// drops the TLD, and title-cases the result.
function brandFromHostname(host: string): string {
  if (!host) return "";
  const parts = host.split(".").filter(Boolean);
  if (parts.length === 0) return "";
  // For 3+ labels (subdomain.domain.tld), use the registrable part. For
  // 2 labels (domain.tld), use the SLD. For 1 label (localhost), use it.
  const base = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function LoginPage({ forceTemplate }: { forceTemplate?: "default" | "admin" } = {}) {
  const { t } = useTranslation();
  const { token, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<LoginFormValues>();
  const config = useDomainStore((s) => s.config);
  const loaded = useDomainStore((s) => s.loaded);
  // Prefer explicit brand_name (admin-set), fall back to a hostname-derived
  // label so freshly-added domains don't flash "Nexoratech".
  const brandName =
    config?.brand_name ||
    brandFromHostname(typeof window !== "undefined" ? window.location.hostname : "") ||
    "Nexoratech";
  const domainTemplate = config?.login_template ?? "default";
  const firstAllowedPath = useDomainStore((s) => s.firstAllowedPath);

  // Already-logged-in user hitting /login: send them where they belong.
  // Tool kiosk → creator workspace; everyone else → their normal landing.
  const me = useAuthStore.getState().user;
  if (token) {
    const dest = me?.tool_install_id ? "/create-video-pro" : firstAllowedPath();
    return <Navigate to={dest} replace />;
  }

  // 2FA flow state: server responds 401 totp_required khi user có
  // totp_enabled. FE chuyển sang form nhập code mà KHÔNG mất email/
  // password (lưu trong needTotp). Submit lại kèm totp_code.
  const [needTotp, setNeedTotp] = useState<LoginFormValues | null>(null);
  const [totpCode, setTotpCode] = useState("");

  const onSubmit = handleSubmit(async (values: LoginFormValues) => {
    setError(null);
    try {
      const data = await authService.login(values);
      const me = await authService.meWithToken(data.access_token);
      setAuth(data.access_token, me);
      const target =
        me?.tool_install_id
          ? "/create-video-pro"
          : (me?.role === "admin" || me?.role === "super_admin")
            ? "/dashboard"
            : firstAllowedPath();
      navigate(target);
    } catch (e: any) {
      const code = e?.response?.data?.detail?.code;
      // 401 + code='totp_required' / 'totp_invalid' → chuyển sang form
      // nhập 2FA, giữ credentials trong state. KHÔNG show "wrong
      // password" — user thấy "nhập code" sau khi password đã pass server.
      if (code === "totp_required" || code === "totp_invalid") {
        setNeedTotp(values);
        if (code === "totp_invalid") {
          setError(t("auth.totp_invalid", "Mã 2FA sai hoặc đã hết hạn"));
          setTotpCode("");
        }
        return;
      }
      setError(e?.response?.data?.detail?.message ?? t("auth.login_failed", "Login failed"));
    }
  });

  const submitTotp = async () => {
    if (!needTotp || !totpCode) return;
    setError(null);
    try {
      const data = await authService.login({ ...needTotp, totp_code: totpCode });
      const me = await authService.meWithToken(data.access_token);
      setAuth(data.access_token, me);
      const target =
        me?.tool_install_id
          ? "/create-video-pro"
          : (me?.role === "admin" || me?.role === "super_admin")
            ? "/dashboard"
            : firstAllowedPath();
      navigate(target);
    } catch (e: any) {
      const code = e?.response?.data?.detail?.code;
      if (code === "totp_invalid") {
        setError(t("auth.totp_invalid", "Mã 2FA sai. Thử lại."));
        setTotpCode("");
        return;
      }
      setError(e?.response?.data?.detail?.message ?? t("auth.login_failed", "Login failed"));
    }
  };

  // Until domain config has resolved we don't know which template the
  // domain wants, and rendering the fallback briefly flashes the wrong
  // layout to the user before swapping. Show a minimal placeholder on the
  // same dark backdrop both layouts use — feels like a single render to
  // the eye since the load typically completes in <100ms.
  if (!forceTemplate && !loaded) {
    return <div className="min-h-screen bg-slate-900" aria-busy="true" />;
  }

  // Khi cần 2FA, render UI inline thay layout. Đơn giản, không nhân
  // đôi 2 layout admin/default vì 2FA prompt giống nhau ở mọi domain.
  if (needTotp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
        <div className="w-full max-w-sm bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-6 space-y-4">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30 grid place-items-center mb-3">
              <span className="text-emerald-300 text-xl">🔐</span>
            </div>
            <h1 className="text-lg font-bold text-slate-100">Xác thực 2 lớp</h1>
            <p className="text-xs text-slate-400 mt-1">
              Mở app Authenticator của bạn, nhập 6-digit code dưới đây
            </p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 font-mono text-2xl tracking-widest text-center focus:border-emerald-400 focus:outline-none"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && totpCode.length === 6 && submitTotp()}
            placeholder="000000"
            autoFocus
          />
          {error && <p className="text-xs text-rose-400 text-center">{error}</p>}
          <button
            type="button"
            onClick={submitTotp}
            disabled={totpCode.length !== 6}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"
          >
            Xác thực
          </button>
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer text-center hover:text-slate-200">
              Mất điện thoại? Dùng backup code
            </summary>
            <p className="mt-2 text-center">
              Nhập 1 trong 8 backup codes (10 ký tự) thay vì 6-digit code.
              Mỗi code dùng được 1 lần.
            </p>
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  const longCode = prompt("Backup code (10 ký tự):");
                  if (longCode && longCode.trim()) {
                    setTotpCode(longCode.trim());
                    setTimeout(submitTotp, 100);
                  }
                }}
                className="text-amber-400 hover:underline"
              >
                Dùng backup code
              </button>
            </div>
          </details>
          <button
            type="button"
            onClick={() => { setNeedTotp(null); setTotpCode(""); setError(null); }}
            className="w-full text-xs text-slate-500 hover:text-slate-300 py-1"
          >
            ← Quay lại login
          </button>
        </div>
      </div>
    );
  }

  const template = forceTemplate ?? domainTemplate;
  const layoutProps = { brandName, error, isSubmitting, register, onSubmit };

  if (template === "admin") return <LoginLayoutAdmin {...layoutProps} />;
  return <LoginLayoutDefault {...layoutProps} />;
}
