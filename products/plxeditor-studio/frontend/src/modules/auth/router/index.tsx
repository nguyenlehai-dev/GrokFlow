import type { FrontendModule } from "@/app/types";

import { LoginPage } from "../views/LoginPage";
import { RegisterPage } from "../views/RegisterPage";

/** Public auth module — login + signup pages.
 *  PublicRouteGuard at the route level enforces the domain's allow_login /
 *  allow_register flags; we don't replicate that here. */
export const moduleManifest: FrontendModule = {
  name: "auth",
  label: "Authentication",
  routes: [
    { path: "login", element: <LoginPage /> },
    { path: "register", element: <RegisterPage /> },
  ],
  // No nav: login/register aren't reachable from the post-login sidebar.
};
