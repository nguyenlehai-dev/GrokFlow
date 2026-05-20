import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Bell, Check, AlertCircle, Info, AlertTriangle, CheckCheck } from "lucide-react";

import { api } from "@/core/api/axios";

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  target_url: string | null;
  severity: string;       // info | warning | error | success
  read_at: string | null;
  created_at: string;
}

interface NotificationList {
  items: NotificationItem[];
  unread_count: number;
  total: number;
}

const SEVERITY_VISUAL: Record<string, { icon: typeof Info; color: string }> = {
  info:    { icon: Info,           color: "text-sky-600" },
  warning: { icon: AlertTriangle,  color: "text-amber-600" },
  error:   { icon: AlertCircle,    color: "text-rose-600" },
  success: { icon: Check,          color: "text-emerald-600" },
};

/** Header notification bell. Polls /api/notifications every 15s, shows
 *  unread count badge, opens a dropdown panel on click. Mark-as-read on
 *  item click (or for-all via the panel's footer button). Closes on
 *  outside-click + route change. */
export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get<NotificationList>("/api/notifications?limit=20")).data,
    refetchInterval: 15_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => api.post("/api/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const unread = data?.unread_count ?? 0;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
        aria-label={t("header.unread_aria", { count: unread })}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 z-50 rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden">
          <header className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
            <h3 className="font-semibold text-sm">{t("header.notifications")}</h3>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-xs text-violet-600 hover:text-violet-700 inline-flex items-center gap-1"
              >
                <CheckCheck size={12} /> {t("header.mark_all_read")}
              </button>
            )}
          </header>

          <div className="max-h-96 overflow-y-auto">
            {(data?.items ?? []).length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">
                {t("header.notif_empty")}
              </p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {data!.items.map((n) => {
                  const visual = SEVERITY_VISUAL[n.severity] ?? SEVERITY_VISUAL.info;
                  const Icon = visual.icon;
                  const isUnread = !n.read_at;
                  const rowClass = `flex gap-3 px-3 py-2.5 ${
                    isUnread ? "bg-violet-50/50" : ""
                  } hover:bg-white cursor-pointer text-left transition`;
                  const inner = (
                    <>
                      <Icon size={16} className={`${visual.color} flex-shrink-0 mt-0.5`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm ${isUnread ? "font-semibold" : ""} text-slate-800`}>
                            {n.title}
                          </p>
                          {isUnread && (
                            <span className="h-1.5 w-1.5 rounded-full bg-violet-600 flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        {n.body && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(n.created_at).toLocaleString(i18n.language?.startsWith("en") ? "en-US" : "vi-VN")}
                        </p>
                      </div>
                    </>
                  );
                  // Click handler — mark read, navigate if target_url present.
                  const onClick = () => {
                    if (isUnread) markRead.mutate(n.id);
                    setOpen(false);
                  };
                  return (
                    <li key={n.id}>
                      {n.target_url ? (
                        <Link to={n.target_url} className={rowClass} onClick={onClick}>
                          {inner}
                        </Link>
                      ) : (
                        <button type="button" className={`w-full ${rowClass}`} onClick={onClick}>
                          {inner}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="border-t border-slate-200 px-3 py-2 text-center">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              {t("header.notif_config")}
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}
