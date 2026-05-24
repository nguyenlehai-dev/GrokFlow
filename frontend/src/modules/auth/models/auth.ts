export interface LoginPayload {
  email: string;
  password: string;
  /** 6-digit TOTP code hoặc 10-char backup code. Chỉ gửi ở submit lần
   *  2 sau khi server trả 401 totp_required. */
  totp_code?: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type?: string;
}

export interface LoginFormValues {
  email: string;
  password: string;
  totp_code?: string;
}

export interface RegisterFormValues {
  email: string;
  password: string;
  password_confirm: string;
  full_name: string;
}
