import React from "react";
import ReactDOM from "react-dom/client";
import "@grokflow/ui/theme.css";
import { ToastProvider, listenForThemeMessages } from "@grokflow/ui";
import { App } from "./App";

// Pick up theme overrides sent by core (URL ?theme=... or postMessage).
// Falls back to defaults from theme.css if nothing arrives.
listenForThemeMessages();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
