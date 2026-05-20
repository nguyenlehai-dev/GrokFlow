"""Playwright runtime helpers used by providers + session checker.

Use `launch_context(profile_path)` as an async context manager. It launches
Chromium with `user_data_dir=profile_path` so cookies/localStorage from the
user's previous browser session persist.

Anti-bot heuristics (UA spoofing, --disable-blink-features=AutomationControlled,
real-looking viewport) help avoid trivial detection. Not bulletproof against
strong anti-bot — providers may still flag.
"""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from playwright.async_api import BrowserContext, Page, async_playwright

DEFAULT_VIEWPORT = {"width": 1366, "height": 768}
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
DEFAULT_LAUNCH_ARGS = [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
]


@asynccontextmanager
async def launch_context(
    profile_path: str,
    *,
    headless: bool = True,
    viewport: dict | None = None,
    user_agent: str | None = None,
    extra_args: list[str] | None = None,
) -> AsyncIterator[BrowserContext]:
    """Launch persistent Chromium context bound to profile_path."""
    Path(profile_path).mkdir(parents=True, exist_ok=True)
    args = DEFAULT_LAUNCH_ARGS + (extra_args or [])
    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=profile_path,
            headless=headless,
            viewport=viewport or DEFAULT_VIEWPORT,
            user_agent=user_agent or DEFAULT_USER_AGENT,
            args=args,
            ignore_default_args=["--enable-automation"],
        )
        try:
            yield context
        finally:
            await context.close()


async def first_page(context: BrowserContext) -> Page:
    """Reuse existing page if any (avoids about:blank tabs cluttering)."""
    if context.pages:
        return context.pages[0]
    return await context.new_page()


def is_login_redirect(url: str, login_keywords: tuple[str, ...] = ("login", "sign-in", "signin", "auth")) -> bool:
    lower = url.lower()
    return any(kw in lower for kw in login_keywords)
