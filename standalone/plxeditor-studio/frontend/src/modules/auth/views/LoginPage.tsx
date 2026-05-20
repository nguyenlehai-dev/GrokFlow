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

  const onSubmit = handleSubmit(async (values: LoginFormValues) => {
    setError(null);
    try {
      const data = await authService.login(values);
      const me = await authService.meWithToken(data.access_token);
      setAuth(data.access_token, me);
      // Tool-scoped users (desktop kiosk) land directly on the branded
      // creator workspace, bypassing the admin sidebar/dashboard. Web
      // admins keep their existing flow.
      const target =
        me?.tool_install_id
          ? "/create-video-pro"
          : (me?.role === "admin" || me?.role === "super_admin")
            ? "/dashboard"
            : firstAllowedPath();
      navigate(target);
    } catch (e: any) {
      setError(e?.response?.data?.detail?.message ?? t("auth.login_failed", "Login failed"));
    }
  });

  // Until domain config has resolved we don't know which template the
  // domain wants, and rendering the fallback briefly flashes the wrong
  // layout to the user before swapping. Show a minimal placeholder on the
  // same dark backdrop both layouts use — feels like a single render to
  // the eye since the load typically completes in <100ms.
  if (!forceTemplate && !loaded) {
    return <div className="min-h-screen bg-slate-900" aria-busy="true" />;
  }

  const template = forceTemplate ?? domainTemplate;
  const layoutProps = { brandName, error, isSubmitting, register, onSubmit };

  if (template === "admin") return <LoginLayoutAdmin {...layoutProps} />;
  return <LoginLayoutDefault {...layoutProps} />;
}
