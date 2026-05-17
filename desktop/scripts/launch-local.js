// Bulletproof launcher for `npm run start:local`.
//
// `cross-env VAR=` only SETS the var to empty string — on Windows, some
// systems have ELECTRON_RUN_AS_NODE=1 in user/system env vars, which
// Electron treats as truthy and runs main.js as plain Node (crashing on
// `app.getVersion()`). This wrapper DELETES the var from process.env
// before spawning Electron, so the child binary boots into proper main-
// process mode regardless of how the shell was launched.
const { spawn } = require("child_process");

delete process.env.ELECTRON_RUN_AS_NODE;
process.env.GROKFLOW_SERVER_URL =
  process.env.GROKFLOW_SERVER_URL || "http://localhost:5173/";

// `require("electron")` in plain Node returns the path to the binary.
const electronBin = require("electron");

const child = spawn(electronBin, ["."], {
  stdio: "inherit",
  shell: false,
  windowsHide: false,
});

child.on("close", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("[launch-local] failed to spawn electron:", err);
  process.exit(1);
});
