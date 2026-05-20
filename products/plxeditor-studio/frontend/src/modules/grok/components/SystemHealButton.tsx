import { useState } from "react";

import { api } from "@/core/api/axios";

/** Super_admin one-click infrastructure heal.
 *
 *  Calls POST /api/admin/system/heal which:
 *    1. Refreshes the VNC short-id → IP nginx map
 *    2. SSH'es into the host + restarts the nginx-reload path
 *       watcher if dead + forces one nginx reload
 *
 *  Use case: every once in a while the host systemd `.path` unit
 *  drops to `failed` state and stops triggering nginx reloads on
 *  map changes. The cron keepalive catches it within 5 min, but
 *  this button is the manual override for "fix it NOW".
 *
 *  Visible only to super_admin (the caller-side check is also
 *  enforced server-side).
 */
type HealResp = {
  map_refreshed: boolean;
  map_refresh_error: string | null;
  nginx_reloaded: boolean;
  nginx_reload_error: string | null;
  watcher_state: string | null;
  message: string;
};

export function SystemHealButton() {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (!confirm(
      "Heal sẽ:\n" +
      "  1. Làm mới nginx VNC map\n" +
      "  2. SSH host + restart watcher nếu chết + reload nginx\n\n" +
      "An toàn, không ảnh hưởng job đang chạy. Tiếp tục?",
    )) return;
    setBusy(true);
    try {
      const { data } = await api.post<HealResp>("/api/admin/system/heal");
      // eslint-disable-next-line no-alert
      alert(
        `✅ Heal xong\n\n` +
        `Map: ${data.map_refreshed ? "refreshed" : "no-op"}\n` +
        `Nginx: ${data.nginx_reloaded ? "reloaded" : "skipped"}\n` +
        `Watcher: ${data.watcher_state ?? "?"}\n\n` +
        (data.message || ""),
      );
    } catch (err) {
      // toast handler in axios already surfaces server message
      console.error("[heal]", err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="btn-ghost text-violet-600 hover:bg-violet-50 hover:text-violet-700"
      title="Fix nginx VNC map + restart watcher khi /vnc/ routes 502. Super_admin only."
    >
      {busy ? "Healing…" : "🩺 Heal infra"}
    </button>
  );
}
