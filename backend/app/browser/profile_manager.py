"""Profile filesystem + session helpers.

Phase 1: stub.
Phase 2: real session check via Playwright headless visit + cookie import.
"""

import json
import shutil
from pathlib import Path

from app.browser.playwright_session import first_page, is_login_redirect, launch_context
from app.core.encryption import decrypt, encrypt


PROVIDER_HOMES: dict[str, str] = {
    "grok": "https://grok.com/",
    "flow": "https://labs.google/flow",
}


def ensure_profile_dir(profile_path: str) -> Path:
    p = Path(profile_path).resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


def remove_profile_dir(profile_path: str) -> None:
    p = Path(profile_path).resolve()
    if p.exists() and p.is_dir():
        shutil.rmtree(p, ignore_errors=True)


def _normalize_cookie(c: dict) -> dict:
    cookie = {
        "name": c["name"],
        "value": c["value"],
        "domain": c.get("domain", ""),
        "path": c.get("path", "/"),
    }
    expires = c.get("expires") or c.get("expirationDate")
    if expires:
        cookie["expires"] = float(expires)
    cookie["httpOnly"] = bool(c.get("httpOnly", False))
    cookie["secure"] = bool(c.get("secure", False))
    same_site = c.get("sameSite", "Lax")
    if isinstance(same_site, str):
        ss = same_site.capitalize()
        if ss in ("No_restriction", "None"):
            ss = "None"
        elif ss not in ("Strict", "Lax", "None"):
            ss = "Lax"
        cookie["sameSite"] = ss
    return cookie


async def import_cookies(profile_path: str, cookies_json: list[dict]) -> int:
    """Pre-populate the profile with cookies the user exported.

    User exports cookies from a local Chrome (extension "Cookie-Editor" or similar)
    while logged in to the provider, then uploads the JSON here.
    """
    ensure_profile_dir(profile_path)
    normalized = [_normalize_cookie(c) for c in cookies_json]
    async with launch_context(profile_path, headless=True) as context:
        await context.add_cookies(normalized)
    return len(normalized)


async def check_session(profile_path: str, provider: str, *, timeout_ms: int = 15000) -> tuple[bool, str | None]:
    """Visit provider home with the profile. Returns (logged_in, error)."""
    home = PROVIDER_HOMES.get(provider)
    if not home:
        return False, f"Unknown provider {provider}"

    try:
        async with launch_context(profile_path, headless=True) as context:
            page = await first_page(context)
            await page.goto(home, wait_until="domcontentloaded", timeout=timeout_ms)
            if is_login_redirect(page.url):
                return False, f"Redirected to login: {page.url}"
            return True, None
    except Exception as exc:  # noqa: BLE001
        return False, f"check_session error: {type(exc).__name__}: {exc}"


async def export_storage_state(profile_path: str) -> str:
    """Encrypted JSON of cookies + localStorage. Used as DB backup of session."""
    async with launch_context(profile_path, headless=True) as context:
        state = await context.storage_state()
        return encrypt(json.dumps(state))


def decrypt_storage_state(encrypted: str) -> dict:
    return json.loads(decrypt(encrypted))
