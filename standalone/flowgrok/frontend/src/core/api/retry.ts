/**
 * Deploy-resilient axios retry interceptor.
 *
 * The backend container restarts during auto-deploy (commit lands → cron
 * pulls → docker compose up rebuilds backend). For ~5-15s the host nginx
 * upstream returns 502/503/504. Without retry, every in-flight API call
 * during that window surfaces as "Lỗi máy chủ" — the user thinks the app
 * is broken when it's actually mid-deploy.
 *
 * This wraps any axios instance so transient gateway errors and network
 * blips are retried with exponential backoff. Method whitelist keeps
 * non-idempotent writes (POST/PATCH) from being duplicated on a
 * mid-flight 502 — the user has to manually retry those, which is the
 * safe default for actions like "create job" or "submit form".
 */
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

type RetryConfig = AxiosRequestConfig & {
  _retryCount?: number;
};

const MAX_RETRIES = 3;
// 1s → 2s → 4s, total max wait 7s. Auto-deploy backend restart is
// typically 5-15s; three retries plus the inherent request RTT cover
// the common deploy window. Frontend container restart is <5s and
// affects /index.html, not API requests.
const BACKOFF_MS = [1000, 2000, 4000];

// Idempotent methods are safe to retry blindly — no risk of creating
// duplicate side effects on the backend. POST/PATCH are excluded by
// default; modules that know their POST is idempotent can opt in via
// `config.headers["X-Retry-On-502"] = "yes"`.
const SAFE_METHODS = new Set(["get", "head", "options", "put", "delete"]);

// Transient upstream conditions worth retrying. 502/503/504 specifically
// mean "nginx couldn't reach backend" or "backend overloaded" — both
// resolve as the new container comes up. 500 is NOT in this list because
// 500 usually means the backend returned a real error (uncaught exception
// in a handler), not a transport failure — retrying just delays the
// real error reaching the user.
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function isRetryable(err: unknown): boolean {
  // Network error (no response): connection refused / DNS / timeout —
  // most common manifestation of the backend being mid-restart.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyErr = err as any;
  if (!anyErr?.response) return true;
  return RETRYABLE_STATUSES.has(anyErr.response.status);
}

function methodAllowsRetry(config: AxiosRequestConfig): boolean {
  const method = (config.method ?? "get").toLowerCase();
  if (SAFE_METHODS.has(method)) return true;
  // Explicit opt-in for POST/PATCH that the caller knows is idempotent.
  const optIn = config.headers?.["X-Retry-On-502"];
  return optIn === "yes" || optIn === "true";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Install retry interceptor on the given axios instance. Returns the
 * instance so calls can chain. Safe to call once per instance — calling
 * twice would stack interceptors and double-retry, which is wasteful but
 * not broken.
 */
export function installRetryInterceptor(instance: AxiosInstance): AxiosInstance {
  instance.interceptors.response.use(
    (r: AxiosResponse) => r,
    async (err) => {
      const config = err.config as RetryConfig | undefined;
      if (!config) return Promise.reject(err);

      if (!isRetryable(err) || !methodAllowsRetry(config)) {
        return Promise.reject(err);
      }

      config._retryCount = (config._retryCount ?? 0) + 1;
      if (config._retryCount > MAX_RETRIES) {
        return Promise.reject(err);
      }

      const waitMs = BACKOFF_MS[config._retryCount - 1] ?? 4000;
      await delay(waitMs);
      return instance.request(config);
    },
  );
  return instance;
}

/** Internal — exposed for tests. */
export const __test = { isRetryable, methodAllowsRetry, BACKOFF_MS, MAX_RETRIES };
