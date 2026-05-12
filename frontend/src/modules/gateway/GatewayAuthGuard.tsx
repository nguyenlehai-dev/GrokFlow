import type { ReactNode } from "react";

/** Compat shim — gateway pages no longer need a separate login.
 *
 *  Gateway requests now go through /api/gateway-proxy/* on the GrokFlow
 *  backend, which is auth'd by the GrokFlow admin JWT and forwards to
 *  gatewaygrok with a cached server-side token. ProtectedRoute + AdminGuard
 *  (where applicable) already cover the GrokFlow side.
 *
 *  Kept as a passthrough so existing imports continue to work.
 */
export function GatewayAuthGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
