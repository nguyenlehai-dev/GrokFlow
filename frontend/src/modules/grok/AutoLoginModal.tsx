import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/axios";
import { toast } from "@/components/ui/Toast";


function IframeWithRetry({ url, onReady }: { url: string; onReady: () => void }) {
  // VNC container races: by the time the iframe loads, Docker DNS may still
  // serve stale NXDOMAIN. Reload up to 5 times (every 3s) until we get content.
  const ref = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState(url);
  useEffect(() => {
    const probe = setInterval(async () => {
      try {
        const r = await fetch(url.split("?")[0], { method: "HEAD" });
        if (r.ok) {
          setSrc(`${url}&_t=${Date.now()}`);  // cache-bust
          clearInterval(probe);
          onReady();
        }
      } catch {}
    }, 1500);
    const cap = setTimeout(() => clearInterval(probe), 60000);
    return () => { clearInterval(probe); clearTimeout(cap); };
  }, [url]);

  return (
    <iframe
      key={attempt}
      ref={ref}
      src={src}
      className="w-full h-full border-0"
      allow="clipboard-read; clipboard-write"
      onError={() => attempt < 5 && setTimeout(() => setAttempt((a) => a + 1), 2000)}
    />
  );
}

interface VncSession {
  profile_id: string;
  iframe_url: string;
  username: string;
  password: string;
  expires_in: number;
}

export function AutoLoginModal({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<VncSession | null>(null);
  const [phase, setPhase] = useState<"starting" | "ready" | "saving" | "error">("starting");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post<VncSession>(`/api/profiles/${profileId}/start-vnc-session`);
        if (cancelled) return;
        setSession(data);
        setPhase("ready");
      } catch (e: any) {
        if (cancelled) return;
        setErrMsg(e?.response?.data?.detail?.message ?? "Không khởi động được VNC session");
        setPhase("error");
      }
    })();
    return () => { cancelled = true; };
  }, [profileId]);

  const finish = async () => {
    setPhase("saving");
    try {
      await api.post(`/api/profiles/${profileId}/finish-vnc-session`);
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast("Đã lưu — browser vẫn chạy nền cho worker dùng", "success");
      onClose();
    } catch {
      setPhase("ready");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-6xl h-[90vh] rounded-lg bg-white shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Đăng nhập provider — browser trong web</h2>
            <p className="text-xs text-slate-500">
              Đăng nhập tài khoản provider trong khung dưới. Xong bấm <strong>Lưu &amp; đóng</strong>.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={finish}
              disabled={phase !== "ready"}
              className="btn-primary"
            >
              {phase === "saving" ? "Đang lưu..." : "Lưu & đóng"}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">Hủy</button>
          </div>
        </div>

        <div className="flex-1 bg-slate-100 relative">
          {phase === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
              <div className="text-center space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent mx-auto" />
                <p>Đang khởi động Chrome (kasmweb)... 10-30s</p>
              </div>
            </div>
          )}
          {phase === "error" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-2 max-w-md">
                <p className="text-rose-600 font-medium">Lỗi khởi động VNC</p>
                <p className="text-sm text-slate-600">{errMsg}</p>
                <button onClick={onClose} className="btn-ghost">Đóng</button>
              </div>
            </div>
          )}
          {session && phase !== "error" && (
            <IframeWithRetry
              url={session.iframe_url}
              onReady={() => setPhase("ready")}
            />
          )}
        </div>

        <div className="border-t bg-slate-50 px-4 py-2 text-xs text-slate-500">
          Login Grok bình thường (paste pass Ctrl+V được). Xong bấm <strong>Lưu &amp; đóng</strong> —
          browser sẽ tiếp tục chạy nền để worker chạy job. Muốn tắt browser hoàn toàn, dùng nút
          <strong> Stop browser</strong> ở row profile.
        </div>
      </div>
    </div>
  );
}
