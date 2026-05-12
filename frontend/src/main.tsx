import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { router } from "@/app/router";
import { ToastContainer } from "@/components/ui/Toast";
import { useDomainStore } from "@/core/domain/store";
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
    },
  },
});

// Fire-and-forget on boot — the route guards read from the store; null config
// is treated as fail-open until the response lands a tick later.
useDomainStore.getState().load();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastContainer />
    </QueryClientProvider>
  </React.StrictMode>,
);
