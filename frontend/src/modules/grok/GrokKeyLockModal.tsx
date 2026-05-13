import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock, Loader2, KeyRound } from "lucide-react";
import { Link } from "react-router-dom";

import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";
import { useGrokKey } from "./grokKeyStore";

/** Lock modal that sits over the Grok Playground when no API key is
 *  verified yet. Mirrors `gateway/PlaygroundLockModal` shape so the two
 *  Playgrounds look identical to operators. Admins bypass via a guard
 *  one level up — this component never sees the admin role.
 */
export function GrokKeyLockModal() {
  const [keyInput, setKeyInput] = useState("");
  const setVerified = useGrokKey((s) => s.setVerified);

  const verify = useMutation({
    mutationFn: (key: string) =>
      api.post<{
        verified: boolean;
        label: string | null;
        user_email: string | null;
        allowed_providers: string[] | null;
        allowed_job_types: string[] | null;
        daily_limit: number | null;
        used_today: number | null;
      }>("/api/api-keys/verify", { key }),
    onSuccess: ({ data }, key) => {
      if (data.verified) {
        setVerified({
          key,
          label: data.label ?? "",
          user_email: data.user_email ?? "",
          allowed_providers: data.allowed_providers ?? [],
          allowed_job_types: data.allowed_job_types ?? [],
          daily_limit: data.daily_limit,
          used_today: data.used_today,
        });
        toast("Grok API Key verified", "success");
      } else {
        toast("Key không hợp lệ. Tạo key ở /api-keys và paste lại.", "error");
      }
    },
    onError: () => toast("Không xác minh được key", "error"),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
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
              Verify một Grok API Key trước khi submit job từ Playground. Tạo key mới ở{" "}
              <Link to="/api-keys" className="text-violet-600 hover:underline">
                /api-keys
              </Link>{" "}
              nếu chưa có.
            </p>
          </div>
        </div>

        <form
          className="mt-5 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = keyInput.trim();
            if (trimmed) verify.mutate(trimmed);
          }}
        >
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Grok API Key</span>
            <div className="mt-1 flex items-center rounded-md border border-slate-300 px-2 focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500">
              <KeyRound size={14} className="text-slate-400" />
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="uxpm_live_..."
                className="w-full bg-transparent px-2 py-2 text-sm outline-none font-mono"
                autoFocus
              />
            </div>
          </label>
          <button
            type="submit"
            disabled={verify.isPending || !keyInput.trim()}
            className="w-full btn-primary inline-flex items-center justify-center gap-2"
          >
            {verify.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> Đang xác minh…</>
            ) : (
              <>Xác minh & mở khóa</>
            )}
          </button>
        </form>

        <p className="mt-3 text-xs text-slate-500">
          Key được lưu trong localStorage trình duyệt + gắn vào header{" "}
          <code className="rounded bg-slate-100 px-1">Authorization: Bearer …</code>{" "}
          khi submit job. Đăng xuất hoặc click "Đổi key" để xóa.
        </p>
      </div>
    </div>
  );
}
