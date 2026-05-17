// Preload runs in an isolated, sandboxed context before the renderer's
// page scripts. With `sandbox: true` (set in main.js for security), Node
// modules like `fs` / `path` are NOT available here — that's by design.
// We use ipcRenderer.invoke for anything the renderer needs from the OS.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("grokflowDesktop", {
  isDesktop: true,
  platform: process.platform,

  /** Open a folder path in the OS file explorer. The main process
   *  mkdir-p's the folder first so per-panel defaults open cleanly on
   *  first run; falls back to <Documents>/GrokFlow/<name> if the drive
   *  doesn't exist. Returns `{ok: true, path}` on success. */
  openFolder: (path) => ipcRenderer.invoke("cvp:open-folder", path),

  /** Open a native folder-chooser. Returns `{ok: true, path}` or
   *  `{ok: false, cancelled: true}` if user dismissed. */
  pickFolder: (defaultPath) => ipcRenderer.invoke("cvp:pick-folder", defaultPath),
});
