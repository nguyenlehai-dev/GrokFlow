"""Flow (Google Labs Flow) provider — video generation via labs.google/flow.

User must export Google session cookies from a logged-in Chrome (Cookie-Editor
on labs.google + accounts.google.com). Selectors below are best-effort.
"""

import asyncio
import time

import httpx
from playwright.async_api import TimeoutError as PWTimeout

from app.browser.playwright_session import first_page, is_login_redirect, launch_context
from app.providers.base import JobInput, JobResult, Provider, ResultFile

PROMPT_INPUT_SELECTORS = [
    "textarea[aria-label*='prompt' i]",
    "textarea[placeholder*='describe' i]",
    "div[contenteditable='true']",
    "textarea",
]

VIDEO_RESULT_SELECTORS = [
    "video source",
    "video[src]",
    "a[href$='.mp4']",
]


class FlowProvider(Provider):
    name = "flow"

    HOME = "https://labs.google/flow"
    NAV_TIMEOUT_MS = 45000
    PROMPT_TIMEOUT_MS = 600000  # video can take minutes

    async def run(self, job: JobInput) -> JobResult:
        if job.job_type != "video":
            return JobResult(success=False, error_code="unsupported_job_type",
                             error_message=f"Flow only supports video, got {job.job_type}")
        return await self._run_video(job)

    async def _run_video(self, job: JobInput) -> JobResult:
        try:
            async with launch_context(job.profile_path, headless=True) as context:
                page = await first_page(context)
                try:
                    await page.goto(self.HOME, wait_until="domcontentloaded",
                                    timeout=self.NAV_TIMEOUT_MS)
                except PWTimeout:
                    return JobResult(success=False, error_code="timeout",
                                     error_message="Navigation timed out", retryable=True)

                if is_login_redirect(page.url, login_keywords=("login", "signin", "accounts.google.com")):
                    return JobResult(success=False, error_code="cookie_expired",
                                     error_message=f"Redirected to login: {page.url}")

                prompt_el = await self._find_first(page, PROMPT_INPUT_SELECTORS, 15000)
                if not prompt_el:
                    return JobResult(success=False, error_code="network_error",
                                     error_message="Could not locate prompt input",
                                     retryable=True)
                await prompt_el.click()
                await prompt_el.fill(job.prompt)
                await page.keyboard.press("Enter")

                video_url: str | None = None
                deadline = time.monotonic() + self.PROMPT_TIMEOUT_MS / 1000
                while time.monotonic() < deadline:
                    el = await self._find_first(page, VIDEO_RESULT_SELECTORS, 3000)
                    if el:
                        url = await el.get_attribute("src") or await el.get_attribute("href")
                        if url and url.startswith("http"):
                            video_url = url
                            break
                    await asyncio.sleep(5)

                if not video_url:
                    return JobResult(success=False, error_code="timeout",
                                     error_message="No video result within timeout",
                                     retryable=True)

                cookies = await context.cookies()
                jar = httpx.Cookies()
                for c in cookies:
                    jar.set(c["name"], c["value"], domain=c.get("domain", ""), path=c.get("path", "/"))
                async with httpx.AsyncClient(cookies=jar, follow_redirects=True, timeout=300) as client:
                    resp = await client.get(video_url, headers={"Referer": self.HOME})
                    if resp.status_code != 200:
                        return JobResult(success=False, error_code="network_error",
                                         error_message=f"Video download HTTP {resp.status_code}",
                                         retryable=True)

                file_name = f"flow_video_{int(time.time())}.mp4"
                return JobResult(
                    success=True,
                    files=[ResultFile(bytes=resp.content, name=file_name,
                                      mime="video/mp4", source_url=video_url)],
                    extra={"source_url": video_url},
                )

        except Exception as exc:  # noqa: BLE001
            return JobResult(success=False, error_code="unknown_error",
                             error_message=f"{type(exc).__name__}: {exc}", retryable=True)

    @staticmethod
    async def _find_first(page, selectors: list[str], timeout_ms: int):
        for sel in selectors:
            try:
                el = await page.wait_for_selector(sel, timeout=timeout_ms, state="attached")
                if el:
                    return el
            except PWTimeout:
                continue
        return None
