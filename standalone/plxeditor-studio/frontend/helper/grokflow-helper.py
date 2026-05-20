#!/usr/bin/env python3
"""GrokFlow Helper — local launcher for provider login.

Run on YOUR LOCAL machine (Windows/Mac/Linux) — NOT on the server.
Opens Chrome with a fresh profile, you log in to the provider, close Chrome,
then cookies + storage state get encrypted and uploaded to GrokFlow.

Usage:

    python grokflow-helper.py --server https://flowgrok.vpspanel.io.vn \
        --token <HELPER_TOKEN_FROM_DASHBOARD> --profile <PROFILE_ID>

Or interactively:

    python grokflow-helper.py
    # script will prompt for inputs

Requires: Python 3.9+, Chrome installed.

The helper does NOT send your password anywhere. It only collects cookies
(after you close Chrome) and uploads them to YOUR GrokFlow server.
"""

import argparse
import getpass
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

PROVIDER_URLS = {
    "grok": "https://grok.com/",
    "flow": "https://labs.google/flow",
}


def find_chrome() -> str | None:
    candidates: list[str] = []
    if platform.system() == "Windows":
        candidates += [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        ]
    elif platform.system() == "Darwin":
        candidates += [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
    else:
        for cmd in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge"):
            path = shutil.which(cmd)
            if path:
                return path
    for c in candidates:
        if c and Path(c).exists():
            return c
    return None


def read_cookies_from_profile(user_data_dir: Path) -> list[dict]:
    """Read Chrome's Cookies SQLite db from a profile directory.

    Cookies stored in: <user-data-dir>/Default/Network/Cookies (Chrome 96+) or
    <user-data-dir>/Default/Cookies (older). They are encrypted at-rest using
    OS keychain — but Playwright/Cookie-Editor approach reads via DB directly.

    For cross-platform simplicity we use Chrome DevTools Protocol via
    `--remote-debugging-port` instead. See `launch_with_cdp` flow below.
    """
    raise NotImplementedError("Use launch_with_cdp() flow instead.")


def launch_with_cdp(chrome: str, url: str, user_data_dir: Path, port: int = 9222) -> subprocess.Popen:
    """Launch Chrome with a remote-debugging port so we can pull cookies via CDP."""
    args = [
        chrome,
        f"--remote-debugging-port={port}",
        f"--user-data-dir={user_data_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        url,
    ]
    return subprocess.Popen(args)


def cdp_get(port: int, path: str) -> Any:
    url = f"http://127.0.0.1:{port}{path}"
    with urllib.request.urlopen(url, timeout=5) as r:
        return json.load(r)


def cdp_post(port: int, target_id: str, method: str, params: dict | None = None) -> dict:
    """Send a CDP command to a target via JSON-over-HTTP shim — we use websocket actually."""
    raise NotImplementedError("Use websocket impl below.")


def get_all_cookies_via_cdp(port: int) -> list[dict]:
    """Use CDP `Network.getAllCookies` over websocket to dump everything."""
    try:
        from websocket import create_connection  # type: ignore
    except ImportError:
        print("[!] Cần cài websocket-client: pip install websocket-client")
        sys.exit(1)

    targets = cdp_get(port, "/json")
    target = next((t for t in targets if t.get("type") == "page"), None)
    if not target:
        return []
    ws_url = target["webSocketDebuggerUrl"]
    ws = create_connection(ws_url, timeout=10)
    msg_id = 1
    ws.send(json.dumps({"id": msg_id, "method": "Network.getAllCookies"}))
    while True:
        raw = ws.recv()
        msg = json.loads(raw)
        if msg.get("id") == msg_id:
            ws.close()
            return msg.get("result", {}).get("cookies", [])


def normalize_cookies(cookies: list[dict]) -> list[dict]:
    """Convert CDP cookie shape → format Playwright/our backend accepts."""
    out = []
    for c in cookies:
        cookie = {
            "name": c["name"],
            "value": c["value"],
            "domain": c.get("domain", ""),
            "path": c.get("path", "/"),
            "httpOnly": c.get("httpOnly", False),
            "secure": c.get("secure", False),
            "sameSite": c.get("sameSite", "Lax"),
        }
        if c.get("expires") and c["expires"] > 0:
            cookie["expires"] = c["expires"]
        out.append(cookie)
    return out


def upload_cookies(server: str, token: str, profile_id: str, cookies: list[dict]) -> None:
    url = f"{server.rstrip('/')}/api/profiles/{profile_id}/upload-cookies-helper"
    body = json.dumps({"cookies": cookies}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.load(r)
            print(f"[+] Server accepted: profile.status={resp.get('status')}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"[!] HTTP {e.code}: {body}", file=sys.stderr)
        sys.exit(1)


def prompt(question: str, default: str | None = None, secret: bool = False) -> str:
    suffix = f" [{default}]" if default else ""
    if secret:
        return getpass.getpass(f"{question}{suffix}: ") or (default or "")
    return input(f"{question}{suffix}: ").strip() or (default or "")


def main() -> None:
    parser = argparse.ArgumentParser(description="GrokFlow Helper")
    parser.add_argument("--server", help="GrokFlow URL, e.g. https://flowgrok.vpspanel.io.vn")
    parser.add_argument("--token", help="Helper token from dashboard (Profile → Auto login)")
    parser.add_argument("--profile", help="Profile UUID")
    parser.add_argument("--provider", default="grok", choices=list(PROVIDER_URLS.keys()))
    parser.add_argument("--port", type=int, default=9222, help="CDP port")
    args = parser.parse_args()

    server = args.server or prompt("Server URL", "https://flowgrok.vpspanel.io.vn")
    token = args.token or prompt("Helper token (paste from dashboard)", secret=True)
    profile_id = args.profile or prompt("Profile UUID")
    provider = args.provider

    if not server or not token or not profile_id:
        print("[!] Cần đủ server + token + profile id.", file=sys.stderr)
        sys.exit(1)

    chrome = find_chrome()
    if not chrome:
        print("[!] Không tìm thấy Chrome. Cài Google Chrome rồi thử lại.", file=sys.stderr)
        sys.exit(1)

    url = PROVIDER_URLS[provider]
    print(f"[+] Chrome: {chrome}")
    print(f"[+] Provider: {provider} → {url}")

    with tempfile.TemporaryDirectory(prefix=f"grokflow_{provider}_") as tmp:
        user_data_dir = Path(tmp)
        print(f"[+] Profile tạm: {user_data_dir}")
        proc = launch_with_cdp(chrome, url, user_data_dir, args.port)
        print(f"[+] Chrome đang mở. Đăng nhập {provider} bình thường.")
        print("    Khi xong, ĐÓNG TOÀN BỘ Chrome (close window) → cookies sẽ tự sync.")

        # Wait for Chrome to exit
        try:
            proc.wait()
        except KeyboardInterrupt:
            print("\n[!] Hủy bỏ — đóng Chrome.")
            proc.terminate()
            sys.exit(1)

        # After Chrome closed, we need to read cookies. But CDP requires Chrome
        # running. So instead: read cookies BEFORE close via a polling thread,
        # or run a 2nd Chrome instance with the same user-data-dir to read.
        # Simplest: spawn a brief headless Chrome on the same user-data-dir + dump cookies.
        print("[+] Đọc cookies từ profile...")
        time.sleep(1)
        readout = subprocess.Popen(
            [
                chrome,
                f"--user-data-dir={user_data_dir}",
                f"--remote-debugging-port={args.port}",
                "--headless=new",
                "--no-first-run",
                "--no-default-browser-check",
                url,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(4)  # let Chrome boot
        try:
            cookies = get_all_cookies_via_cdp(args.port)
        finally:
            readout.terminate()
            try:
                readout.wait(timeout=5)
            except subprocess.TimeoutExpired:
                readout.kill()

        if not cookies:
            print("[!] Không lấy được cookies. Bạn có thật sự đăng nhập không?", file=sys.stderr)
            sys.exit(1)
        print(f"[+] Lấy được {len(cookies)} cookies.")

        normalized = normalize_cookies(cookies)
        print(f"[+] Upload tới {server}...")
        upload_cookies(server, token, profile_id, normalized)
        print("[✓] Hoàn tất! Profile đã được đánh dấu logged_in trên dashboard.")


if __name__ == "__main__":
    main()
