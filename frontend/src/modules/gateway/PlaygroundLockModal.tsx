import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { gwApi, extractError } from "./common";
import { usePlaygroundKey } from "./playgroundKeyStore";
import { toast } from "@/components/ui/Toast";

/** Modal-style lock that sits over the Playground form when no Gateway API
 *  Key has been verified yet. Matches the plxeditor design from the user's
 *  reference screenshot — admin bypasses via a guard one level up, so this
 *  component never sees the admin role.
 */
export function PlaygroundLockModal() {
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const setVerified = usePlaygroundKey((s) => s.setVerified);

  const verify = useMutation({
    mutationFn: (key: string) =>
      gwApi.post<{ verified: boolean; label: string | null; allowed_functions: string[] }>(
        "/api/v1/gateway/gateway-keys/verify", { key },
      ),
    onSuccess: ({ data }, key) => {
      if (data.verified) {
        setVerified(key, data.label ?? "", data.allowed_functions);
        toast("Gateway API Key verified", "success");
        setOpen(false);
      } else {
        toast("Key không hợp lệ — kiểm tra lại hoặc generate key mới ở /gateway/gateway-keys", "error");
      }
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm animate-fade-in backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Lock size={20} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              System Auth Required
            </p>
            <h2 className="text-xl font-bold text-slate-900 mt-1">Playground is locked</h2>
            <p className="text-sm text-slate-600 mt-2">
              Verify a Gateway API Key before running execute, async submit, or
              request-status checks from the Playground.
            </p>
          </div>
        </div>

        {open ? (
          <div className="mt-5 space-y-3">
            <input
              autoFocus
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="gwk_live_..."
              className="input font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && keyInput) verify.mutate(keyInput);
              }}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)} className="btn-ghost text-sm">
                Hủy
              </button>
              <button
                onClick={() => verify.mutate(keyInput)}
                disabled={!keyInput || verify.isPending}
                className="btn-primary text-sm inline-flex items-center gap-1.5"
              >
                {verify.isPending ? (
                  <><Loader2 size={14} className="animate-spin" /> Verifying...</>
                ) : (
                  <><CheckCircle2 size={14} /> Verify Key</>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Chưa có key? Vào <a href="/gateway/gateway-keys" className="text-brand-600 underline">/gateway/gateway-keys</a> để issue key mới.
            </p>
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="btn-primary w-full mt-5 inline-flex items-center justify-center gap-1.5"
          >
            <Lock size={14} /> Open System Auth
          </button>
        )}
      </div>
    </div>
  );
}


/** Indicator chip + clear button that lives in the top-right of the
 *  Playground page to show verify status. Admin sees a different chip.
 */
export function SystemAuthIndicator({ isAdmin }: { isAdmin: boolean }) {
  const current = usePlaygroundKey((s) => s.current);
  const clear = usePlaygroundKey((s) => s.clear);

  if (isAdmin) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 size={12} /> Admin (full access)
      </span>
    );
  }

  if (!current) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200">
        <AlertCircle size={12} /> System Auth not verified
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 size={12} /> System Auth verified · {current.label}
      <button
        onClick={() => clear()}
        className="ml-1 hover:text-slate-700 underline"
        title="Đăng xuất key"
      >
        clear
      </button>
    </span>
  );
}
