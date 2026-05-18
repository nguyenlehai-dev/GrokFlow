# GrokFlow Desktop

Electron wrapper around the GrokFlow SaaS web UI at `https://nexoratech.com.vn/`.
Ships as a **single Windows installer** customers download and double-click.

## Architecture

```
Customer PC          Server (yours)
┌──────────┐         ┌──────────────────┐
│ GrokFlow │ ─HTTPS─▶│ nexoratech.com.vn│
│   .exe   │         │  (FastAPI + DB)   │
└──────────┘         └──────────────────┘
```

The desktop app is a thin Electron shell. No local server, no local DB.
Auth, profile, entitlements, AI features all live on the central server.
Customer logs in with email/password you provisioned via the super_admin
UI on the server; `/api/me` returns their profile.

## Build

```powershell
cd desktop
npm install            # one-time, ~50s + native rebuild
npm run dist           # → dist\GrokFlow-Setup-1.0.0.exe (~76 MB)
npm run dist:portable  # → dist\GrokFlow 1.0.0.exe (no installer, run-anywhere)
```

Output files in `dist/`:

| File | Size | Use case |
|---|---|---|
| `GrokFlow-Setup-1.0.0.exe` | ~76 MB | **Installer** — Start menu + Desktop shortcut + Add/Remove Programs |
| `GrokFlow 1.0.0.exe`        | ~73 MB | **Portable** — run from anywhere, no install |

## Configuration

| Setting | Where | Default |
|---|---|---|
| Server URL | `src/main.js` `SERVER_URL` | `https://nexoratech.com.vn/` |
| App name / icon | `package.json` `build.productName`, `build/icon.*` | `GrokFlow`, blue/violet "G" |
| Version | `package.json` `version` | `1.0.0` |
| Publisher | `package.json` `build.win.publisherName` | `Nexora Tech` |

### Pointing at a staging server

```powershell
$env:GROKFLOW_SERVER_URL = "https://staging.nexoratech.com.vn/"
npm run start                # dev (opens window, no build)
```

For build-time embed: hardcode in `src/main.js` or pass via electron-builder's
`extraMetadata`.

## Why a desktop app vs just bookmarking the web URL?

- **Dedicated window** — separate from browser tabs, harder to accidentally close
- **Start menu / taskbar integration** — feels like a "real" app to non-technical users
- **Single-instance lock** — double-clicking the shortcut focuses existing window
- **External-link sandboxing** — links to twitter/youtube/etc. open in user's
  real browser; only your origin runs in the app window
- **Branding** — customer sees "GrokFlow" in the title bar, not "Cloudflare"
  or whatever certificate-front the SaaS sits behind

## Customer install flow

1. Customer downloads `GrokFlow-Setup-1.0.0.exe` from your distribution channel
   (email, download page, etc.)
2. Double-click installer
   - **Windows SmartScreen warning** appears because the .exe is unsigned —
     customer clicks "More info" → "Run anyway". See [Code signing](#code-signing)
     below to eliminate this.
3. NSIS wizard appears: pick install dir → Install
4. App launches, shows login screen (served from `nexoratech.com.vn`)
5. Customer enters credentials you provisioned via super_admin UI
6. Profile + entitlements load from server; AI features unlock per their plan

## Code signing

The bundle is **unsigned** — customers see a Windows SmartScreen warning
("Windows protected your PC") on first install. To remove this:

1. Buy an EV (Extended Validation) code-signing certificate (~$200-400/yr)
   from Sectigo, DigiCert, or Certum.
2. Plug certificate into `package.json` `build.win`:
   ```json
   "win": {
     "signtoolOptions": {
       "certificateFile": "C:\\path\\to\\cert.pfx",
       "certificatePassword": "..."
     }
   }
   ```
3. Re-build. Signed .exe builds reputation over time; SmartScreen warnings
   disappear after enough downloads on EV certs.

Until then, the app works fine but customers must dismiss the warning.

## Updating the app

For now: every release, customer downloads + reinstalls the new `.exe`. NSIS
installer handles upgrade (keeps user data in `%AppData%/grokflow`).

Future: integrate `electron-updater` for silent auto-update — server hosts
`latest.yml` + new installer; app polls + downloads + relaunches. Requires
`build.publish` config in `package.json` (currently `null`).

## Build troubleshooting

### `Cannot create symbolic link` errors

Already fixed via `win.signAndEditExecutable=false` in package.json. If you
hit it on a fresh checkout, enable **Windows Developer Mode** (Settings →
Privacy & security → For developers) to grant symlink rights, OR run the
build from an elevated PowerShell.

### `Error: Cannot find module 'electron'`

```
npm install
```

### Icon doesn't show in installer

Re-generate with `python build/generate-icon.py` (needs `pip install Pillow`).
Replace `build/icon.ico` + `build/icon.png` with your own art before shipping.

### `npm start` errors `Cannot read properties of undefined (reading 'app')`

VS Code's integrated terminal exports `ELECTRON_RUN_AS_NODE=1`, which forces
Electron binaries to run as plain Node instead of as a desktop process.
Unset it before launching:

```powershell
$env:ELECTRON_RUN_AS_NODE = $null
npm start
```

Bash:
```bash
unset ELECTRON_RUN_AS_NODE
npm start
```

This only affects local dev/test. Customers running the built installer are
not affected — their machines don't have this var set.

## Layout

```
desktop/
├── package.json       — electron + electron-builder config + build target
├── README.md          — you are here
├── src/
│   ├── main.js        — Electron main process (BrowserWindow + menu + IPC)
│   └── preload.js     — bridge to renderer (contextBridge stub)
├── build/
│   ├── icon.ico       — Windows .ico (multi-resolution 16-256)
│   ├── icon.png       — 512x512 fallback
│   └── generate-icon.py — placeholder icon generator (Pillow)
└── dist/              — gitignored; build artifacts land here
    ├── GrokFlow-Setup-1.0.0.exe
    ├── GrokFlow 1.0.0.exe
    └── win-unpacked/  — raw unpacked Electron app (for debugging)
```
