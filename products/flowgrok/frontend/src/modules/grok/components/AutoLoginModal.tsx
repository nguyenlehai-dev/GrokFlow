import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/Toast";
import type { VncSession } from "../models/vnc";
import { profilesService } from "../services/profiles.service";


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

export function AutoLoginModal({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [session, setSession] = useState<VncSession | null>(null);
  const [phase, setPhase] = useState<"starting" | "ready" | "saving" | "error">("starting");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await profilesService.startVncSession(profileId);
        if (cancelled) return;
        setSession(data);
        setPhase("ready");
      } catch (e: any) {
        if (cancelled) return;
        setErrMsg(e?.response?.data?.detail?.message ?? t("grok.auto_login_start_failed"));
        setPhase("error");
      }
    })();
    return () => { cancelled = true; };
  }, [profileId]);

  const finish = async () => {
    setPhase("saving");
    try {
      await profilesService.finishVncSession(profileId);
      qc.invalidateQueries({ queryKey: ["profiles"] });
      toast(t("grok.auto_login_saved"), "success");
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
            <h2 className="font-semibold">{t("grok.auto_login_title")}</h2>
            <p className="text-xs text-slate-500">
              {t("grok.auto_login_subtitle_prefix")} <strong>{t("grok.auto_login_save_close")}</strong>.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={finish}
              disabled={phase !== "ready"}
              className="btn-primary"
            >
              {phase === "saving" ? t("grok.auto_login_saving") : t("grok.auto_login_save_close")}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">{t("grok.auto_login_cancel")}</button>
          </div>
        </div>

        <div className="flex-1 bg-slate-100 relative">
          {phase === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
              <div className="text-center space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent mx-auto" />
                <p>{t("grok.auto_login_starting_chrome")}</p>
              </div>
            </div>
          )}
          {phase === "error" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-2 max-w-md">
                <p className="text-rose-600 font-medium">{t("grok.auto_login_error_title")}</p>
                <p className="text-sm text-slate-600">{errMsg}</p>
                <button onClick={onClose} className="btn-ghost">{t("grok.auto_login_close")}</button>
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

        <div className="border-t bg-white px-4 py-2 text-xs text-slate-500">
          {t("grok.auto_login_footer_prefix")} <strong>{t("grok.auto_login_save_close")}</strong>
          {" — "}{t("grok.auto_login_footer_middle")}
          <strong> {t("grok.auto_login_stop_browser")}</strong> {t("grok.auto_login_footer_suffix")}
        </div>
      </div>
    </div>
  );
}
