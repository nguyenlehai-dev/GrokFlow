import type { ReactNode } from "react";
import { useAuthStore } from "@/core/auth/store";
import { useDomainStore } from "@/core/domain/store";
import { useGrokKey } from "./grokKeyStore";
import { GrokKeyLockModal } from "./GrokKeyLockModal";

/** Gates `children` behind a verified Grok API key, same as Playground.
 *
 *  Renders the children un-greyed but covered by the lock modal when:
 *    - the domain has `require_playground_key=true` AND
 *    - the current user is NOT admin/super_admin AND
 *    - no key has been verified yet (zustand+localStorage)
 *
 *  Admins always pass through. Domains that opted out of the gate via
 *  `/admin/domains` also pass through. Use it to lock /jobs, /profiles,
 *  or any other Grok page that should require key auth — wrap once,
 *  reuse everywhere.
 */
export function KeyGate({ children }: { children: ReactNode }) {
  const me = useAuthStore((s) => s.user);
  const verified = useGrokKey((s) => s.current);
  const gateRequired = useDomainStore((s) => s.config?.require_playground_key ?? true);
  const isAdmin = me?.role === "admin" || me?.role === "super_admin";
  const locked = gateRequired && !isAdmin && !verified;

  return (
    <div className="relative">
      <div className={locked ? "pointer-events-none opacity-40 select-none" : ""}>
        {children}
      </div>
      {locked && <GrokKeyLockModal />}
    </div>
  );
}
