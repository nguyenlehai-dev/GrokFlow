/** Outbound proxy used by browser-automation profiles. */
export interface Proxy {
  id: string;
  name: string;
  server: string;
  port: number;
  username: string | null;
  password: string | null;
  kind: string;
  country: string | null;
  sticky_session: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Lighter projection used by Profile dropdown. */
export interface ProxyRef {
  id: string;
  name: string;
}
