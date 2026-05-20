import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Lock, Loader2, KeyRound, CheckCircle2, AlertCircle, Sparkles, X } from "lucide-react";

import { extractError } from "../utils/common";
import { gatewayKeysService } from "../services/gatewayKeys.service";
import { usePlaygroundKey } from "../stores/playgroundKeyStore";
import { toast } from "@/components/ui/Toast";

/** Lock that sits over the Gateway Playground when no Gateway API Key
 *  has been verified yet. Mirrors the Grok Playground flow — single
 *  modal where the user can either Generate a brand-new key (which is
 *  persisted to /gateway/gateway-keys) or paste an existing one, then
 *  Verify in one click.
 */
export function PlaygroundLockModal() {
  const [systemAuthOpen, setSystemAuthOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in p-4">
      {systemAuthOpen ? (
        <SystemAuthDialog onClose={() => setSystemAuthOpen(false)} />
      ) : (
        <LockedCard onOpen={() => setSystemAuthOpen(true)} />
      )}
    </div>
  );
}

function LockedCard({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Lock size={20} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
            {t("gateway.lock_modal_eyebrow")}
          </p>
          <h2 className="text-xl font-bold text-slate-800 mt-1">
            {t("gateway.lock_modal_title")}
          </h2>
          <p className="text-sm text-slate-600 mt-2">
            Verify một Gateway API Key trước khi gọi execute / async submit / request-status từ Playground.
            Bạn có thể generate key mới ngay tại đây, hoặc dán key đã tạo ở{" "}
            <Link to="/gateway/gateway-keys" className="text-violet-600 hover:underline">
              /gateway/gateway-keys
            </Link>.
          </p>
        </div>
      </div>
      <button
        onClick={onOpen}
        className="btn-primary w-full mt-5 inline-flex items-center justify-center gap-1.5"
      >
        <Lock size={14} /> {t("gateway.lock_modal_open_auth")}
      </button>
    </div>
  );
}

function SystemAuthDialog({ onClose }: { onClose: () => void }) {
  const setVerified = usePlaygroundKey((s) => s.setVerified);
  const [keyName, setKeyName] = useState("Playground Key");
  const [keyValue, setKeyValue] = useState("");
  const [status, setStatus] = useState<"idle" | "verified" | "invalid">("idle");

  const generate = useMutation({
    mutationFn: () =>
      gatewayKeysService.create({
        label: keyName.trim() || "Playground Key",
        // Empty allowed_functions = allow all (backend convention); keep
        // sensible defaults so the key works out-of-the-box from Playground.
        allowed_functions: [],
        webhook_url: null,
        rate_limit_per_minute: 60,
        daily_quota: 1000,
        status: "active",
      }),
    onSuccess: (data) => {
      setKeyValue(data.plain_key);
      setStatus("idle");
      toast("Key đã tạo — bấm Verify để mở khóa", "success");
    },
    onError: (e: any) => toast(extractError(e), "error"),
  });

  const verify = useMutation({
    mutationFn: (key: string) => gatewayKeysService.verify(key),
    onSuccess: ({ data }, key) => {
      if (data.verified) {
        setVerified(key, data.label ?? keyName, data.allowed_functions);
        setStatus("verified");
        toast("Gateway API Key verified", "success");
        onClose();
      } else {
        setStatus("invalid");
      }
    },
    onError: (e: any) => {
      setStatus("invalid");
      toast(extractError(e), "error");
    },
  });

  return (
    <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">System Auth</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tạo hoặc dán Gateway API Key, sau đó Verify để mở khóa Playground.
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">API Base URL</span>
          <input
            readOnly
            value="/api"
            className="input mt-1 w-full font-mono bg-slate-50 text-slate-500"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Key Name / Identifier</span>
          <input
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="Playground Key"
            className="input mt-1 w-full"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Gateway API Key</span>
          <div className="mt-1 flex items-stretch gap-2">
            <div className="flex-1 flex items-center rounded-md border border-slate-200 px-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
              <KeyRound size={14} className="text-slate-400" />
              <input
                type="text"
                value={keyValue}
                onChange={(e) => { setKeyValue(e.target.value); setStatus("idle"); }}
                placeholder="Paste your Gateway API key (gwk_live_…)"
                className="w-full bg-transparent px-2 py-2 text-sm outline-none font-mono"
              />
            </div>
            <button
              type="button"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              className="btn-ghost border border-slate-200 inline-flex items-center gap-1.5 px-3 text-sm whitespace-nowrap"
              title="Tạo key mới — sẽ xuất hiện trong /gateway/gateway-keys"
            >
              {generate.isPending ? (
                <><Loader2 size={14} className="animate-spin" /> Generating…</>
              ) : (
                <><Sparkles size={14} /> Generate Key</>
              )}
            </button>
          </div>
        </label>

        <StatusPanel status={status} />

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => { setKeyValue(""); setStatus("idle"); }}
            className="btn-ghost border border-slate-200 text-sm"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => keyValue.trim() && verify.mutate(keyValue.trim())}
            disabled={!keyValue.trim() || verify.isPending}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            {verify.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> Verifying…</>
            ) : (
              <><CheckCircle2 size={14} /> Verify</>
            )}
          </button>
        </div>

        <p className="text-xs text-slate-500 pt-1 border-t mt-2">
          Key sinh ra ở đây luôn được lưu vào{" "}
          <Link to="/gateway/gateway-keys" className="text-violet-600 hover:underline">
            /gateway/gateway-keys
          </Link>{" "}
          để bạn quản lý / thu hồi sau.
        </p>
      </div>
    </div>
  );
}

function StatusPanel({ status }: { status: "idle" | "verified" | "invalid" }) {
  if (status === "verified") {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 inline-flex items-start gap-2">
        <CheckCircle2 size={16} className="mt-0.5" />
        <div>
          <div className="font-semibold">Verified</div>
          <div className="text-xs text-emerald-700">Đang mở khóa Playground…</div>
        </div>
      </div>
    );
  }
  if (status === "invalid") {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 inline-flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5" />
        <div>
          <div className="font-semibold">Not verified</div>
          <div className="text-xs text-rose-700">
            Key không hợp lệ. Generate key mới hoặc paste lại key khác.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      Generate key mới hoặc paste key có sẵn, sau đó bấm <strong>Verify</strong>.
      Cho đến khi verify, customer-facing flows vẫn bị khóa.
    </div>
  );
}


/** Indicator chip + clear button that lives in the top-right of the
 *  Playground page to show verify status. Admin sees a different chip.
 */
export function SystemAuthIndicator({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation();
  const current = usePlaygroundKey((s) => s.current);
  const clear = usePlaygroundKey((s) => s.clear);

  if (isAdmin) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 size={12} /> {t("gateway.lock_modal_indicator_admin")}
      </span>
    );
  }

  if (!current) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200">
        <AlertCircle size={12} /> {t("gateway.lock_modal_indicator_unverified")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 size={12} /> {t("gateway.lock_modal_indicator_verified")} · {current.label}
      <button
        onClick={() => clear()}
        className="ml-1 hover:text-slate-700 underline"
        title={t("gateway.lock_modal_indicator_logout_title")}
      >
        {t("gateway.lock_modal_indicator_clear")}
      </button>
    </span>
  );
}
