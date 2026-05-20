import type { FrontendModule } from "@/app/types";

import { LandingPage } from "../views/LandingPage";
import { PricingPage } from "../views/PricingPage";

/** Public-facing marketing module — no auth required.
 *  The two pages are reachable to anonymous visitors; ProtectedRoute is
 *  applied per-route at the router level, not here. */
export const moduleManifest: FrontendModule = {
  name: "landing",
  label: "Landing & Pricing",
  routes: [
    { path: "landing", element: <LandingPage /> },
    { path: "pricing", element: <PricingPage /> },
  ],
  // No nav entries — these pages aren't reachable from the post-login sidebar.
};
