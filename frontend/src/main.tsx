import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { router } from "@/app/router";
import { ToastContainer } from "@/components/ui/Toast";
import { ConfirmDialogHost } from "@/components/ui/ConfirmDialog";
import { useDomainStore } from "@/core/domain/store";
import "@/core/i18n";  // side-effect: initializes i18next (auto-detects locale)
import "@/assets/scss/main.scss";

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
void useDomainStore.getState().load().catch(() => {});

// Re-poll every 20s so when an admin flips maintenance_mode (or schedules
// one), already-logged-in users see the change without refresh. Skip when
// the tab is hidden so idle tabs don't burn cache.
// Wrap in try/catch + void — any rejection here must not bubble up; React
// will render whatever's cached.
if (typeof window !== "undefined") {
  window.setInterval(() => {
    if (document.hidden) return;
    void useDomainStore.getState().load().catch(() => {});
  }, 20_000);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastContainer />
      <ConfirmDialogHost />
    </QueryClientProvider>
  </React.StrictMode>,
);
