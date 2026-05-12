import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { PublicRouteGuard } from "@/components/layout/PublicRouteGuard";

import { LoginPage } from "@/modules/auth/LoginPage";
import { RegisterPage } from "@/modules/auth/RegisterPage";
import { LandingPage } from "@/modules/landing/LandingPage";

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
  },
  {
    path: "/login",
    element: <PublicRouteGuard flag="allow_login"><LoginPage /></PublicRouteGuard>,
  },
  {
    path: "/register",
    element: (
      <PublicRouteGuard flag="allow_register" fallback="/login">
        <RegisterPage />
      </PublicRouteGuard>
    ),
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      // Routes are contributed by each registered module's manifest.
      ...getAuthedRoutes(),
    ],
  },
]);
