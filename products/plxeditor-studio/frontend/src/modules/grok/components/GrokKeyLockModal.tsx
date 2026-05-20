import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock, Loader2, KeyRound, CheckCircle2, AlertCircle, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";

import { toast } from "@/components/ui/Toast";
import { useGrokKey } from "../stores/grokKeyStore";
import { apiKeysService } from "../services/apiKeys.service";

/** Lock that sits over the Grok Playground when no API key is verified.
 *
 *  Two-step UX (matches the plxeditor reference):
 *   1. Backdrop card with "Open System Auth" CTA.
 *   2. Modal with API Base URL (read-only), Key Name, Key field + Generate
 *      Key, Verify button. Generate calls POST /api/api-keys (JWT-authed)
 *      and shoves the returned raw key into the field so user can verify
 *      in one click. Verified keys are stored in /api-keys for management.
 */
export function GrokKeyLockModal() {
  const [systemAuthOpen, setSystemAuthOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/50 backdrop-blur-sm animate-fade-in backdrop-blur-sm p-4">
      {systemAuthOpen ? (
        <SystemAuthDialog onClose={() => setSystemAuthOpen(false)} />
      ) : (
        <LockedCard onOpen={() => setSystemAuthOpen(true)} />
      )}
    </div>
  );
}

function LockedCard({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Lock size={20} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
            System Auth Required
          </p>
          <h2 className="text-xl font-bold text-white mt-1">Playground is locked</h2>
          <p className="text-sm text-slate-600 mt-2">
            Verify một Grok API Key trước khi submit job từ Playground. Bạn có thể
            generate key mới ngay tại đây, hoặc dán key đã tạo ở{" "}
            <Link to="/api-keys" className="text-violet-600 hover:underline">/api-keys</Link>.
          </p>
        </div>
      </div>
      <button
        onClick={onOpen}
        className="btn-primary w-full mt-5 inline-flex items-center justify-center gap-1.5"
      >
        <Lock size={14} /> Open System Auth
      </button>
    </div>
  );
}

function SystemAuthDialog({ onClose }: { onClose: () => void }) {
  const setVerified = useGrokKey((s) => s.setVerified);
  const [keyName, setKeyName] = useState("Playground Key");
  const [keyValue, setKeyValue] = useState("");
  const [status, setStatus] = useState<"idle" | "verified" | "invalid">("idle");

  const generate = useMutation({
    mutationFn: () =>
      apiKeysService.create({
        name: keyName.trim() || "Playground Key",
        allowed_providers: ["grok"],
        allowed_job_types: ["image", "video"],
        daily_limit: 1000,
        rate_limit_per_minute: 60,
      }),
    onSuccess: (data) => {
      setKeyValue(data.api_key);
      setStatus("idle");
      toast("Key đã tạo — bấm Verify để mở khóa", "success");
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail?.message || e?.response?.data?.detail || "Tạo key thất bại";
      toast(typeof msg === "string" ? msg : "Tạo key thất bại", "error");
    },
  });

  const verify = useMutation({
    mutationFn: (key: string) => apiKeysService.verify(key),
    onSuccess: (data) => {
      if (data.verified) {
        setVerified({
          key: keyValue,
          label: data.label ?? keyName,
          user_email: data.user_email ?? "",
          allowed_providers: data.allowed_providers ?? [],
          allowed_job_types: data.allowed_job_types ?? [],
          daily_limit: data.daily_limit,
          used_today: data.used_today,
        });
        setStatus("verified");
        toast("Grok API Key verified", "success");
        onClose();
      } else {
        setStatus("invalid");
      }
    },
    onError: () => setStatus("invalid"),
  });

  return (
    <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">System Auth</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tạo hoặc dán Grok API Key, sau đó Verify để mở khóa Playground.
          </p>
        </div>
        <button onClick={onClose} className="text-slate-9000 hover:text-slate-700">
          <X size={18} />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">API Base URL</span>
          <input
            readOnly
            value="/api"
            className="input mt-1 w-full font-mono bg-white text-slate-500"
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
          <span className="font-medium text-slate-700">Grok API Key</span>
          <div className="mt-1 flex items-stretch gap-2">
            <div className="flex-1 flex items-center rounded-md border border-slate-200 px-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
              <KeyRound size={14} className="text-slate-9000" />
              <input
                type="text"
                value={keyValue}
                onChange={(e) => { setKeyValue(e.target.value); setStatus("idle"); }}
                placeholder="Paste your Grok API key"
                className="w-full bg-transparent px-2 py-2 text-sm outline-none font-mono"
              />
            </div>
            <button
              type="button"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
              className="btn-ghost border border-slate-200 inline-flex items-center gap-1.5 px-3 text-sm whitespace-nowrap"
              title="Tạo key mới — sẽ xuất hiện trong /api-keys"
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
          <Link to="/api-keys" className="text-violet-600 hover:underline">/api-keys</Link>{" "}
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
    <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
      Generate key mới hoặc paste key có sẵn, sau đó bấm <strong>Verify</strong>.
      Cho đến khi verify, customer-facing flows vẫn bị khóa.
    </div>
  );
}
