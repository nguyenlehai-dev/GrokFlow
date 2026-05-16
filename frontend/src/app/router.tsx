import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { PublicRouteGuard } from "@/components/layout/PublicRouteGuard";
import { RouteErrorBoundary } from "@/components/layout/RouteErrorBoundary";

import { LoginPage } from "@/modules/auth/views/LoginPage";
import { RegisterPage } from "@/modules/auth/views/RegisterPage";
import { LandingPage } from "@/modules/landing/views/LandingPage";
import { TryImagePage } from "@/modules/landing/views/TryImagePage";

import { getAuthedRoutes } from "./moduleRegistry";

/** The router is split into a public shell and an authed shell.
 *
 *  Public routes (landing / login / register) live at the top so they don't
 *  inherit the AppShell chrome. Each one wraps in PublicRouteGuard so a
 *  domain can disable signup or login per its config.
 *
 *  Authed routes come from the moduleRegistry — every module's manifest
 *  contributes its routes here automatically. Adding a new module is a
 *  one-import change in moduleRegistry.ts. */
export const router = createBrowserRouter([
  {
    path: "/landing",
    element: <PublicRouteGuard flag="allow_landing"><LandingPage /></PublicRouteGuard>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/login",
    element: <PublicRouteGuard flag="allow_login"><LoginPage /></PublicRouteGuard>,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/register",
    element: (
      <PublicRouteGuard flag="allow_register" fallback="/login">
        <RegisterPage />
      </PublicRouteGuard>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  // Public Grok-Image "try-it" page. Reachable to anonymous visitors;
  // auth state changes the quota source (anon = IP-rate-limit, auth = plan).
  {
    path: "/try/image",
    element: <TryImagePage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    // Single errorElement on the authed shell catches 404s from missing
    // module routes + thrown errors from lazy-loaded pages. Replaces the
    // dev-y default "💿 Hey developer 👋" message with a real UX.
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      // Routes are contributed by each registered module's manifest.
      ...getAuthedRoutes(),
      // Catch-all so unknown authed URLs land in the error boundary as a
      // proper 404 instead of a blank screen.
      { path: "*", element: <RouteErrorBoundary /> },
    ],
  },
]);
