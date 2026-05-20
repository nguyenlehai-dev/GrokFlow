import { api } from "@/core/api/axios";

import type { AuthResponse, LoginPayload, RegisterPayload } from "../models/auth";

export const authService = {
  login: (payload: LoginPayload) =>
    api.post<AuthResponse>("/api/auth/login", payload).then((r) => r.data),

  register: (payload: RegisterPayload) =>
    api.post<AuthResponse>("/api/auth/register", payload).then((r) => r.data),

  /** /api/auth/me with an explicit bearer — used right after login/register
   *  before the token has been written into the auth store interceptor. */
  meWithToken: (token: string) =>
    api
      .get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.data),
};
