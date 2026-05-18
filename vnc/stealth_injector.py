"""Inject anti-detection JS into Chromium via CDP before any page script.

Cloudflare Turnstile and similar bot-walls fingerprint Chromium by reading
DOM/JS properties that automation environments fill differently from a
real desktop browser. The classic tells:

  - `navigator.webdriver` is `true` (set when chromium is launched with
    --enable-automation or remote-debugging-port without the stealth
    blink-feature switch)
  - `navigator.plugins` is empty
  - `navigator.languages` is empty / mismatched
  - `Notification.permission` ≠ `navigator.permissions.query({name: 'notifications'})`
  - WebGL UNMASKED_VENDOR/RENDERER report SwiftShader / Mesa software
  - `chrome.runtime` exists on a non-extension page

This script connects to the local CDP endpoint and registers our payload
via `Page.addScriptToEvaluateOnNewDocument`, which runs BEFORE any page
script on every new document. It also reapplies on Target.targetCreated
so newly opened tabs are covered too.

Runs as a supervisord program inside the chrome-vnc image. Idempotent
and crash-tolerant: reconnects if Chromium restarts.
"""
from __future__ import annotations

import json
import time
import urllib.request
import urllib.error

try:
    from websocket import create_connection, WebSocketException
except ImportError:  # pragma: no cover — install path in Dockerfile
    raise SystemExit("websocket-client not installed (apt: python3-websocket)")


DEVTOOLS_URL = "http://127.0.0.1:9222"
STEALTH_JS = r"""
(() => {
  try {
    // Hide webdriver flag. --disable-blink-features=AutomationControlled
    // is supposed to do this but some builds leak the property anyway.
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });
  } catch (e) {}

  try {
    // Fake plugin list — CF checks length (real Chrome ships 5+).
    const plugins = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'Microsoft Edge PDF Viewer', filename: 'edge-pdf' },
      { name: 'WebKit built-in PDF', filename: 'webkit-pdf' },
    ];
    Object.defineProperty(Navigator.prototype, 'plugins', {
      get: () => plugins,
      configurable: true,
    });
    Object.defineProperty(Navigator.prototype, 'mimeTypes', {
      get: () => [{ type: 'application/pdf' }, { type: 'text/pdf' }],
      configurable: true,
    });
  } catch (e) {}

  try {
    Object.defineProperty(Navigator.prototype, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: true,
    });
  } catch (e) {}

  try {
    // Reconcile Notification.permission with permissions API — a classic
    // detection (default Notification.permission is 'default' but
    // permissions.query returns 'denied' under headless).
    if (window.Notification && navigator.permissions && navigator.permissions.query) {
      const origQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (parameters) =>
        parameters && parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission, onchange: null })
          : origQuery(parameters);
    }
  } catch (e) {}

  try {
    // Patch WebGL parameter calls so UNMASKED_VENDOR/RENDERER report a
    // realistic GPU instead of "Google Inc. (SwiftShader)" which is a
    // bot signal on VPS containers without a real GPU.
    const patchCtx = (proto) => {
      if (!proto) return;
      const orig = proto.getParameter;
      proto.getParameter = function (param) {
        // UNMASKED_VENDOR_WEBGL=37445, UNMASKED_RENDERER_WEBGL=37446
        if (param === 37445) return 'Intel Inc.';
        if (param === 37446) return 'Intel Iris OpenGL Engine';
        return orig.apply(this, arguments);
      };
    };
    patchCtx(window.WebGLRenderingContext && window.WebGLRenderingContext.prototype);
    patchCtx(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype);
  } catch (e) {}

  try {
    // Real Chrome exposes window.chrome with a few APIs even on non-
    // extension pages. Empty `window.chrome.runtime` is a bot tell —
    // patch it to be present but minimal.
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
      Object.defineProperty(window.chrome, 'runtime', {
        get: () => ({}),
        configurable: true,
      });
    }
  } catch (e) {}
})();
"""


def _http_get(url: str, timeout: float = 2.0):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.load(r)
    except (urllib.error.URLError, json.JSONDecodeError, OSError):
        return None


def _send(ws, msg_id: int, method: str, params: dict | None = None) -> dict:
    payload = {"id": msg_id, "method": method}
    if params is not None:
        payload["params"] = params
    ws.send(json.dumps(payload))
    # Drain until we get the matching response (skip events).
    while True:
        try:
            raw = ws.recv()
        except WebSocketException:
            return {}
        if not raw:
            return {}
        msg = json.loads(raw)
        if msg.get("id") == msg_id:
            return msg


def _inject_into_target(target: dict) -> bool:
    """Register the stealth script + force a reload.

    `Page.addScriptToEvaluateOnNewDocument` only takes effect on the NEXT
    navigation — chromium's initial load of grok.com already ran CF's JS
    before our patches landed, so the current page never sees them. We
    issue `Page.reload(ignoreCache=true)` immediately after registering
    so the script applies on the second load (the cf_clearance challenge
    will be re-issued, but with stealth applied this time).
    """
    ws_url = target.get("webSocketDebuggerUrl")
    if not ws_url:
        return False
    try:
        ws = create_connection(ws_url, timeout=4)
    except (WebSocketException, OSError):
        return False
    try:
        _send(ws, 1, "Page.enable")
        _send(ws, 2, "Page.addScriptToEvaluateOnNewDocument", {"source": STEALTH_JS})
        # Only reload if the page is already loaded — otherwise we race
        # the initial navigation and may interrupt user-triggered loads.
        url = (target.get("url") or "").lower()
        if url.startswith("http"):
            _send(ws, 3, "Page.reload", {"ignoreCache": True})
        return True
    finally:
        try:
            ws.close()
        except Exception:  # noqa: BLE001
            pass


def main() -> None:
    seen: set[str] = set()
    print("[stealth] waiting for chromium devtools at", DEVTOOLS_URL, flush=True)
    while True:
        targets = _http_get(f"{DEVTOOLS_URL}/json/list")
        if not targets:
            time.sleep(1)
            continue
        for t in targets:
            if t.get("type") != "page":
                continue
            tid = t.get("id")
            if not tid or tid in seen:
                continue
            if _inject_into_target(t):
                seen.add(tid)
                print(f"[stealth] injected into target {tid} ({t.get('url')})", flush=True)
        # Poll for new tabs every 2s; reasonable trade-off between latency
        # and CPU. New tabs may load before injection lands on them —
        # acceptable since the worker doesn't spawn arbitrary tabs.
        time.sleep(2)


if __name__ == "__main__":
    main()
