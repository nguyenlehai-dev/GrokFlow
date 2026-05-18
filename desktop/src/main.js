// GrokFlow Desktop — Electron main process.
//
// Thin shell over the SaaS web UI at SERVER_URL. The desktop adds one
// piece of state the web app doesn't have: a per-install `tool_id`
// (UUID generated on first launch, persisted in the OS user-data dir).
// On boot we POST it to /api/tool-installs/register so super_admin
// sees the machine in their "Auth → Tool Installs" page; admin then
// approves + assigns permissions. We inject the tool_id as a header on
// every outbound request so the server-side auth resolver can apply
// per-install access rules.

const electronModule = require("electron");
// Guard: if Electron is invoked with ELECTRON_RUN_AS_NODE=1 in the env
// (set by some VS Code shells, some installer setups, or inherited from
// a parent Electron app), `require("electron")` returns the binary path
// as a string instead of the framework. We can't run as a desktop app
// from that state, so fail with a help message rather than crashing on
// `app.getVersion()` lower down.
if (typeof electronModule === "string" || !electronModule.app) {
  console.error("\n[fatal] Electron framework didn't load — running as plain Node.");
  console.error("Likely cause: ELECTRON_RUN_AS_NODE is set in your environment.");
  console.error("Fix in PowerShell:");
  console.error("    Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue");
  console.error("    npm run start:local\n");
  process.exit(1);
}
const { app, BrowserWindow, Menu, shell, dialog, session, ipcMain } = electronModule;
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const http = require("http");
const https = require("https");

const SERVER_URL = process.env.GROKFLOW_SERVER_URL || "https://nexoratech.com.vn/";
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CLIENT_VERSION = app.getVersion();

// ── Single-instance lock ────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

// ── tool_id persistence ─────────────────────────────────────────────
// Stored as plain UUID in <userData>/tool_id. userData is per-user, per-app
// so a fresh OS user gets a new tool_id (= a new "install" in admin's view).
// Keeping it as a plain file (not OS keychain) keeps the recovery story
// simple: if a customer asks for help, they can read the value out.

function getOrCreateToolId() {
  const filePath = path.join(app.getPath("userData"), "tool_id");
  try {
    const existing = fs.readFileSync(filePath, "utf8").trim();
    if (existing && existing.length >= 8) return existing;
  } catch {
    /* fall through to create */
  }
  const fresh = crypto.randomUUID();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, fresh, { mode: 0o600 });
  } catch (e) {
    // Persisting failed (e.g. read-only volume) — keep the in-memory value
    // so the current session still has *some* id, but accept that the
    // machine will register as new on next launch.
    console.error("[tool_id] persist failed:", e);
  }
  return fresh;
}

const TOOL_ID = getOrCreateToolId();
console.log(`[tool_id] ${TOOL_ID}`);

// ── Lightweight HTTP POST helper (avoids pulling axios) ─────────────
function postJson(urlString, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const mod = u.protocol === "https:" ? https : http;
    const data = Buffer.from(JSON.stringify(body), "utf8");
    const req = mod.request({
      method: "POST",
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
        "User-Agent": `GrokFlow-Desktop/${CLIENT_VERSION}`,
      },
      timeout: 10_000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(text ? JSON.parse(text) : null); }
          catch { resolve(text); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function registerWithServer() {
  try {
    const out = await postJson(
      new URL("/api/tool-installs/register", SERVER_URL).toString(),
      {
        tool_id: TOOL_ID,
        machine_name: os.hostname(),
        client_version: CLIENT_VERSION,
      },
    );
    console.log(`[register] status=${out?.status} label=${out?.label ?? "(none)"}`);
    return out;
  } catch (e) {
    console.warn(`[register] failed (will retry on heartbeat): ${e.message}`);
    return null;
  }
}

async function heartbeat() {
  try {
    await postJson(
      new URL("/api/tool-installs/heartbeat", SERVER_URL).toString(),
      { tool_id: TOOL_ID, client_version: CLIENT_VERSION },
    );
  } catch (e) {
    console.warn(`[heartbeat] failed: ${e.message}`);
  }
}

// ── Header injection ────────────────────────────────────────────────
// Every request the renderer makes (XHR, fetch, page nav) gets the
// X-Tool-Install-Id header so server-side middleware can look up which
// install is talking. This is configured on the default session so it
// covers both navigation requests and the API calls the React app makes.

function installHeaderInjector() {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
    const url = new URL(details.url);
    const serverHost = new URL(SERVER_URL).hostname;
    // Only attach to requests going to our server — don't leak the
    // install ID to third-party CDNs / analytics / Cloudflare probes.
    if (url.hostname === serverHost) {
      details.requestHeaders["X-Tool-Install-Id"] = TOOL_ID;
      details.requestHeaders["X-Tool-Client-Version"] = CLIENT_VERSION;
    }
    cb({ requestHeaders: details.requestHeaders });
  });
}

// ── Window & menu ───────────────────────────────────────────────────
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
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(SERVER_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(SERVER_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
    if (code === -3) return;
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

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
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
          label: "Copy Tool ID (để báo support)",
          click: () => {
            require("electron").clipboard.writeText(TOOL_ID);
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "Tool ID đã copy",
              message: "Đã copy vào clipboard.",
              detail: `Tool ID: ${TOOL_ID}`,
            });
          },
        },
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
              detail:
                `Phiên bản: ${app.getVersion()}\n` +
                `Server:    ${SERVER_URL}\n` +
                `Tool ID:   ${TOOL_ID}\n` +
                `Máy:       ${os.hostname()}\n\n` +
                `© 2026 Nexora Tech`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// IPC handlers exposed to the renderer via preload.js → contextBridge.
//
// cvp:open-folder — Resolve and open `p` in the OS file explorer.
//   - Creates the folder recursively if it doesn't exist (so per-panel
//     defaults like .../Output/Image_Sync just work on first run).
//   - If the parent drive/root is missing (e.g. "D:\..." on a laptop
//     without a D: drive), we fall back to <Documents>/GrokFlow/<name>
//     instead of erroring — the user wanted to open *some* output folder.
ipcMain.handle("cvp:open-folder", async (_event, p) => {
  try {
    if (typeof p !== "string" || !p) return { ok: false, error: "empty path" };
    let target = p;
    try {
      fs.mkdirSync(target, { recursive: true });
    } catch (mkErr) {
      const leaf = path.basename(target) || "GrokFlow";
      target = path.join(app.getPath("documents"), "GrokFlow", leaf);
      try {
        fs.mkdirSync(target, { recursive: true });
      } catch (fallbackErr) {
        return {
          ok: false,
          error: `mkdir failed: ${mkErr?.message ?? mkErr} | fallback: ${fallbackErr?.message ?? fallbackErr}`,
        };
      }
    }
    const err = await shell.openPath(target);
    if (err) return { ok: false, error: err };
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
});

// cvp:pick-folder — Open native folder-chooser dialog. Returns the
// selected absolute path or {cancelled: true} if user dismissed.
ipcMain.handle("cvp:pick-folder", async (_event, defaultPath) => {
  try {
    const opts = {
      title: "Chọn thư mục lưu",
      properties: ["openDirectory", "createDirectory"],
    };
    if (typeof defaultPath === "string" && defaultPath && fs.existsSync(defaultPath)) {
      opts.defaultPath = defaultPath;
    }
    const res = await dialog.showOpenDialog(mainWindow ?? undefined, opts);
    if (res.canceled || !res.filePaths?.[0]) return { ok: false, cancelled: true };
    return { ok: true, path: res.filePaths[0] };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Ensure per-panel default output folders exist under <Documents>/GrokFlow/
// on startup so the first "Mở thư mục" click always succeeds — even if the
// user never picks a custom folder.
function ensureDefaultOutputFolders() {
  try {
    const root = path.join(app.getPath("documents"), "GrokFlow");
    const subs = ["Text_Video_Grok", "Image_To_Video", "Image_Direct", "Character_Sync", "Image_Sync"];
    for (const s of subs) {
      try { fs.mkdirSync(path.join(root, s), { recursive: true }); } catch { /* */ }
    }
  } catch { /* */ }
}

app.whenReady().then(async () => {
  installHeaderInjector();
  ensureDefaultOutputFolders();
  // Fire-and-forget; window opens whether or not register() succeeds.
  // If the server is unreachable on first launch, the app still opens
  // (user can see the login screen / network error) and the next
  // heartbeat retries.
  registerWithServer();
  setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

  buildMenu();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
