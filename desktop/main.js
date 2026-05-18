// GrokFlow Desktop — Electron main process.
//
// This is a thin shell around the SaaS web UI hosted at the URL below.
// We deliberately keep it minimal: no local server, no local DB, no offline
// mode. The desktop app exists so customers can:
//   - Launch from Start menu / Desktop shortcut (no browser needed)
//   - Get a dedicated window separate from their browser tabs
//   - Have basic OS integration (taskbar, notifications)
//
// Everything else — auth, profile, entitlements, AI features — lives on the
// server and reaches the user via the same HTTPS endpoints the web UI uses.

const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("path");

// Server URL is overridable at build time (electron-builder env) so we can
// produce a "staging" installer pointing at a test server. Default is the
// production tenant.
const SERVER_URL = process.env.GROKFLOW_SERVER_URL || "https://nexoratech.com.vn/";

// Single-instance lock — if the user double-clicks the shortcut while the
// app is already open, focus the existing window instead of spawning a 2nd
// instance (which would duplicate localStorage races + token refresh).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "GrokFlow",
    backgroundColor: "#0f0f17",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Allow the embedded site to use clipboard / fullscreen / media APIs.
      // Without this, paste-from-clipboard in chat composer is broken.
      enableBlinkFeatures: "",
    },
  });

  // Open external links (https://twitter.com/... in helper docs, etc.) in
  // the user's real browser instead of inside our window — keeps the
  // session sandboxed to our origin only.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(SERVER_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Same policy for in-window navigation: block leaving our origin.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(SERVER_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Surface load failures to the user — otherwise a customer with bad
  // network just sees a white screen.
  mainWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
    if (code === -3) return; // -3 = ABORTED (user navigated away), ignore.
    dialog.showErrorBox(
      "Không kết nối được server",
      `Không tải được ${url}\n\nMã lỗi: ${code} — ${desc}\n\nKiểm tra Internet rồi thử lại.`,
    );
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Minimal menu — most users won't touch it but Ctrl+R / Ctrl+Shift+I are
// useful for support troubleshooting. View menu provides zoom controls.
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [{ role: "appMenu" }]
      : []),
    {
      label: "&File",
      submenu: [
        { label: "Tải lại", accelerator: "CmdOrCtrl+R", role: "reload" },
        { type: "separator" },
        { role: isMac ? "close" : "quit", label: "Thoát" },
      ],
    },
    {
      label: "&Xem",
      submenu: [
        { role: "zoomIn", label: "Phóng to" },
        { role: "zoomOut", label: "Thu nhỏ" },
        { role: "resetZoom", label: "Cỡ mặc định" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Toàn màn hình" },
      ],
    },
    {
      label: "&Trợ giúp",
      submenu: [
        {
          label: "Mở trang web",
          click: () => shell.openExternal(SERVER_URL),
        },
        {
          label: "Hỗ trợ",
          click: () => shell.openExternal("mailto:support@nexoratech.com.vn"),
        },
        { type: "separator" },
        {
          label: "DevTools (gỡ rối)",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => mainWindow?.webContents.openDevTools({ mode: "detach" }),
        },
        {
          label: `Về GrokFlow v${app.getVersion()}`,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "Về GrokFlow",
              message: "GrokFlow Desktop",
              detail: `Phiên bản: ${app.getVersion()}\nServer: ${SERVER_URL}\n\n© 2026 Nexora Tech`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  buildMenu();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
