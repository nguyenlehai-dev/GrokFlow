import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldOff, Copy, Check, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { api } from "@/core/api/axios";
import { useAuthStore } from "@/core/auth/store";

interface SetupResult {
  secret: string;
  provisioning_uri: string;
}

interface VerifyResult {
  enabled: boolean;
  backup_codes: string[];
}

/** 2FA TOTP setup section trong /account.
 *
 *  3 trạng thái UI:
 *    1. Chưa setup (totp_enabled=false, totp_secret=null) →
 *       chỉ thấy nút "Bật 2FA"
 *    2. Đã setup nhưng chưa verify (server-side flow) → modal nhập code
 *    3. Đã enable → hiện nút "Tắt 2FA" + danh sách backup codes đã dùng
 *
 *  QR code: tôi không pull QR library nặng, link tới qr-code.show với
 *  URI dạng GET — service public, không leak secret (URI có secret
 *  base32 nhưng QR rendered bởi browser hoặc client app, không
 *  server-side log).
 *
 *  Alternative: render QR client-side bằng qrcode.js (~20KB). Skip cho
 *  v1 để minimal — chỉ show provisioning_uri text + secret text, user
 *  copy paste hoặc dùng tool QR-generator riêng. */
export function TwoFactorSection() {
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();

  const [setupData, setSetupData] = useState<SetupResult | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePw, setDisablePw] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const enabled = !!(me as any)?.totp_enabled;

  const setup = useMutation({
    mutationFn: async () => {
      const r = await api.post<SetupResult>("/api/auth/2fa/setup");
      return r.data;
    },
    onSuccess: (data) => setSetupData(data),
    onError: (e: any) => {
      toast(e?.response?.data?.detail?.message ?? "Setup 2FA lỗi", "error");
    },
  });

  const verify = useMutation({
    mutationFn: async () => {
      const r = await api.post<VerifyResult>("/api/auth/2fa/verify", { code: verifyCode });
      return r.data;
    },
    onSuccess: (data) => {
      setBackupCodes(data.backup_codes);
      setSetupData(null);
      setVerifyCode("");
      // Refresh me để FE biết totp_enabled=true
      api.get("/api/auth/me").then((r) => setUser(r.data)).catch(() => {});
      qc.invalidateQueries({ queryKey: ["me"] });
      toast("Đã bật 2FA. Lưu backup codes ngay bên dưới!", "success");
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail?.message ?? "Mã 2FA sai", "error");
    },
  });

  const disable = useMutation({
    mutationFn: () => api.post("/api/auth/2fa/disable", { password: disablePw }),
    onSuccess: () => {
      setDisablePw("");
      api.get("/api/auth/me").then((r) => setUser(r.data)).catch(() => {});
      qc.invalidateQueries({ queryKey: ["me"] });
      toast("Đã tắt 2FA", "success");
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail?.message ?? "Tắt 2FA lỗi", "error");
    },
  });

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      toast("Trình duyệt chặn clipboard", "error");
    }
  };

  // Render backup codes panel (sau verify thành công)
  if (backupCodes) {
    return (
      <section className="card p-5 space-y-4 border-2 border-amber-300 bg-amber-50/40">
        <div className="flex items-start gap-2">
          <AlertTriangle size={20} className="text-amber-600 mt-0.5" />
          <div>
            <h2 className="font-semibold text-amber-900">Backup codes — lưu ngay</h2>
            <p className="text-xs text-amber-800 mt-1">
              Mỗi code dùng được 1 lần khi mất điện thoại. <strong>Đóng panel = mất code.</strong>{" "}
              Copy ra notebook, password manager, hoặc print.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 font-mono text-sm">
          {backupCodes.map((c) => (
            <div key={c} className="px-3 py-2 bg-white border border-amber-200 rounded">
              {c}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => copy(backupCodes.join("\n"), "backup")}
            className="btn-primary inline-flex items-center gap-1.5"
          >
            {copiedField === "backup" ? <Check size={14} /> : <Copy size={14} />}
            Copy tất cả
          </button>
          <button
            type="button"
            onClick={() => setBackupCodes(null)}
            className="btn-secondary"
          >
            Tôi đã lưu — đóng
          </button>
        </div>
      </section>
    );
  }

  // Render verify panel (sau setup, chờ user nhập code)
  if (setupData) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(setupData.provisioning_uri)}`;
    return (
      <section className="card p-5 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <ShieldCheck size={18} className="text-emerald-600" />
          <h2 className="font-semibold text-slate-700">Setup 2FA — Bước 2/2</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              1. Mở app Authenticator (Google / Authy / 1Password / Bitwarden)
            </p>
            <p className="text-sm text-slate-600">
              2. Scan QR code:
            </p>
            <div className="inline-block p-2 bg-white border border-slate-200 rounded">
              <img src={qrUrl} alt="2FA QR code" width={180} height={180} />
            </div>
            <p className="text-xs text-slate-400">
              QR render bởi api.qrserver.com (client-side, server không log secret)
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-600 mb-1">
                Hoặc nhập secret thủ công:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-2 py-1.5 bg-slate-100 rounded font-mono text-xs break-all">
                  {setupData.secret}
                </code>
                <button
                  type="button"
                  onClick={() => copy(setupData.secret, "secret")}
                  className="btn-secondary px-2 py-1"
                  title="Copy secret"
                >
                  {copiedField === "secret" ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                3. Nhập 6-digit code từ app:
              </label>
              <input
                className="input font-mono text-lg tracking-widest text-center"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => verify.mutate()}
                disabled={verifyCode.length !== 6 || verify.isPending}
                className="btn-primary bg-emerald-600 hover:bg-emerald-700"
              >
                {verify.isPending ? "Đang verify..." : "Xác nhận"}
              </button>
              <button
                type="button"
                onClick={() => { setSetupData(null); setVerifyCode(""); }}
                className="btn-secondary"
              >
                Huỷ
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Render disabled state (user chưa bật 2FA)
  if (!enabled) {
    return (
      <section className="card p-5 space-y-3">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <ShieldOff size={18} className="text-slate-400" />
          <h2 className="font-semibold text-slate-700">2FA — Tắt</h2>
        </div>
        <p className="text-sm text-slate-600">
          Bật xác thực 2 lớp (TOTP) để tăng bảo mật. Hỗ trợ Google Authenticator,
          Authy, 1Password, Bitwarden. Kèm 8 backup codes phòng mất điện thoại.
        </p>
        <p className="text-xs text-amber-700">
          ⚠ Đặc biệt khuyến nghị cho admin / super_admin.
        </p>
        <button
          type="button"
          onClick={() => setup.mutate()}
          disabled={setup.isPending}
          className="btn-primary bg-emerald-600 hover:bg-emerald-700 inline-flex items-center gap-1.5"
        >
          <ShieldCheck size={16} />
          {setup.isPending ? "Đang tạo..." : "Bật 2FA"}
        </button>
      </section>
    );
  }

  // Render enabled state — show disable form
  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
        <ShieldCheck size={18} className="text-emerald-600" />
        <h2 className="font-semibold text-slate-700">2FA — Đang bật</h2>
        <span className="ml-auto text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
          Active
        </span>
      </div>
      <p className="text-sm text-slate-600">
        Mỗi lần đăng nhập sẽ cần 6-digit code từ app Authenticator.
        Backup codes còn lại không hiện ở đây — bạn vẫn còn list đã lưu lúc setup.
      </p>
      <details className="border border-rose-200 rounded p-3 bg-rose-50/40">
        <summary className="cursor-pointer text-sm font-medium text-rose-700">
          Tắt 2FA (yêu cầu mật khẩu)
        </summary>
        <div className="mt-3 space-y-2">
          <input
            type="password"
            className="input"
            placeholder="Mật khẩu hiện tại"
            value={disablePw}
            onChange={(e) => setDisablePw(e.target.value)}
          />
          <button
            type="button"
            onClick={() => disable.mutate()}
            disabled={!disablePw || disable.isPending}
            className="btn-primary bg-rose-600 hover:bg-rose-700"
          >
            {disable.isPending ? "Đang tắt..." : "Tắt 2FA"}
          </button>
          <p className="text-[11px] text-slate-400">
            Tắt 2FA giảm bảo mật — nên chỉ làm khi đổi điện thoại + chưa setup được TOTP mới.
          </p>
        </div>
      </details>
    </section>
  );
}
