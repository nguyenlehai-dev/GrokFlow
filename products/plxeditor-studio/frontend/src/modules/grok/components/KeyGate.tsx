import type { ReactNode } from "react";
import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import { useGrokKey } from "../stores/grokKeyStore";
import { GrokKeyLockModal } from "./GrokKeyLockModal";

/** Gates `children` behind a verified Grok API key, same as Playground.
 *
 *  Renders the children un-greyed but covered by the lock modal when:
 *    - the domain has `require_playground_key=true` AND
 *    - the current user is NOT super_admin AND
 *    - no key has been verified yet (zustand+localStorage)
 *
 *  ONLY super_admin bypasses — domain admins are tenants from the
 *  platform's POV and must verify a key like any external caller. This
 *  matches the "Playground = third-party UX" mental model. Domains that
 *  opted out of the gate via `/admin/domains` also pass through.
 *  Use it to lock /jobs, /profiles, or any other Grok page that should
 *  require key auth — wrap once, reuse everywhere.
 */
export function KeyGate({ children }: { children: ReactNode }) {
  const me = useAuthStore((s) => s.user);
  const verified = useGrokKey((s) => s.current);
  const gateRequired = useDomainStore((s) => s.config?.require_playground_key ?? true);
  const isSuper = me?.role === "super_admin";
  const locked = gateRequired && !isSuper && !verified;

  return (
    <div className="relative">
      <div className={locked ? "pointer-events-none opacity-40 select-none" : ""}>
        {children}
      </div>
      {locked && <GrokKeyLockModal />}
    </div>
  );
}
