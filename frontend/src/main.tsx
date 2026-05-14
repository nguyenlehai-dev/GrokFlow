import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { router } from "@/app/router";
import { ToastContainer } from "@/components/ui/Toast";
import { useDomainStore } from "@/core/domain/store";
import "@/core/i18n";  // side-effect: initializes i18next (auto-detects locale)
import "@/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Treat data as fresh for 10s by default so the many list pages that
      // poll with refetchInterval don't ALSO re-fetch on every component
      // remount or focus change. Pages that need real-time data (Playground
      // execute results, Jobs in flight) opt back in with staleTime: 0.
      staleTime: 10_000,
      // Pause every refetchInterval timer when the tab is hidden. Across
      // ~12 polling pages (Jobs 5s, Profiles 4s, Bell 15s, Dashboard 15s,
      // Audit 30s, etc.) this cuts background traffic to ~zero when users
      // park GrokFlow in a tab — single biggest infra-load saver.
      refetchIntervalInBackground: false,
    },
  },
});

// Fire-and-forget on boot — the route guards read from the store; null config
// is treated as fail-open until the response lands a tick later.
useDomainStore.getState().load();

// Re-poll every 30s so when an admin flips maintenance_mode (or any other
// per-domain flag), already-logged-in users see the change within ~30s
// without having to refresh. Skipped when the tab is hidden to keep the
// backend cache hot only for active sessions.
setInterval(() => {
  if (typeof document !== "undefined" && document.hidden) return;
  useDomainStore.getState().load();
}, 30_000);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastContainer />
    </QueryClientProvider>
  </React.StrictMode>,
);
