"""Grok provider via CDP attach to the per-profile VNC Chromium.

Why CDP attach instead of launch_persistent_context:
- Grok is behind Cloudflare bot protection.
- A fresh Playwright Chromium gets `403 Just-a-moment...` immediately.
- The VNC container's Chromium has cf_clearance from the admin's manual login,
  passes Cloudflare, and is reused for every job for this profile.
- We attach via http://<container_name>:9222 and drive an existing tab.
"""

import asyncio
import re
import time

import asyncio as _asyncio_for_lock

import httpx
from playwright.async_api import TimeoutError as PWTimeout
from playwright.async_api import async_playwright

from app.browser import vnc_manager
from app.providers.base import JobInput, JobResult, Provider, ResultFile

# Per-profile navigation lock: page.goto() on a busy Chromium triggers
# a render-thread storm if many concurrent tabs each try to bootstrap React
# at once. Serializing the navigation step alone keeps tail latency bounded.
# Other phases (typing, polling) remain fully concurrent.
_NAV_LOCKS: dict[str, _asyncio_for_lock.Lock] = {}


def _nav_lock(profile_id: str) -> _asyncio_for_lock.Lock:
    lock = _NAV_LOCKS.get(profile_id)
    if lock is None:
        lock = _asyncio_for_lock.Lock()
        _NAV_LOCKS[profile_id] = lock
    return lock


PROMPT_TEXTAREA = [
    # Grok Imagine page uses tiptap (ProseMirror) rich editor — no textarea.
    "div.tiptap.ProseMirror[contenteditable='true']",
    "div.ProseMirror[contenteditable='true']",
    "div.tiptap[contenteditable='true']",
    "[contenteditable='true'][role='textbox']",
    "textarea[placeholder*='Ask']",
    "textarea[aria-label*='Ask Grok']",
    "textarea[aria-label*='Grok']",
    "textarea[data-testid*='input']",
    "textarea",
    "div[contenteditable='true']",
]

IMAGE_RESULT_SELECTORS = [
    "article img[src*='imgen']",
    "article img[src*='assets.grok']",
    "div[data-testid*='image'] img",
    "img[alt*='Generated']",
    "main img:not([alt*='avatar']):not([alt*='Avatar'])",
]

# Substrings (lower-cased) that indicate Grok refused/rate-limited the request.
# Matched against page innerText after submit. Order matters — most specific first.
RATE_LIMIT_HINTS = [
    "you've reached your daily limit",
    "you have reached your daily limit",
    "you have reached your limit",
    "daily limit reached",
    "rate limit",
    "too many requests",
    "try again later",
    "try again in a",
    "slow down",
    "wait before",
]

PRO_REQUIRED_HINTS = [
    "upgrade to grok",
    "requires a subscription",
    "available with grok",
    "subscribe to grok",
    "x premium",
    "grok heavy",
]


class GrokProvider(Provider):
    name = "grok"

    GROK_HOME = "https://grok.com/"
    GROK_IMAGINE = "https://grok.com/imagine"
    GROK_IMAGINE_VIDEO = "https://grok.com/imagine/video"
    NAV_TIMEOUT_MS = 45000
    # Timeouts tuned by media type. Videos take longer to render than images.
    # If a job hasn't produced media in this window, we give up and retry.
    IMAGE_TIMEOUT_MS = 120000  # 2 min — most images finish in 30-60s
    VIDEO_TIMEOUT_MS = 240000  # 4 min — Grok video can take 90-180s

    async def run(self, job: JobInput) -> JobResult:
        # Same chat-page flow handles both image generation, image-to-image
        # (with attachments), and video (Grok auto-detects from prompt).
        if job.job_type in ("image", "video"):
            return await self._run_image(job)
        return JobResult(success=False, error_code="unsupported_job_type",
                         error_message=f"Grok provider unsupported job_type: {job.job_type}")

    @staticmethod
    def _profile_id_from_path(profile_path: str) -> str:
        return profile_path.rstrip("/").split("/")[-1]

    @staticmethod
    def _log(tag: str, *args) -> None:
        # Print to worker stdout so we can correlate with `docker logs`.
        # JobLog requires a DB session we don't carry into the provider, so
        # stdout is the cheap channel; the worker writes summary JobLog rows.
        msg = " ".join(str(a) for a in args)
        print(f"[grok][{tag}] {msg}", flush=True)

    async def _run_image(self, job: JobInput) -> JobResult:
        profile_id = self._profile_id_from_path(job.profile_path)
        tag = f"{job.job_type[:3]}:{profile_id[:8]}"
        info = vnc_manager.get_for_profile(profile_id)
        if not info or not info.get("running"):
            return JobResult(
                success=False, error_code="cookie_expired",
                error_message="VNC browser not running. Admin must Auto-login this profile first.",
            )

        cdp_endpoint = info["cdp_endpoint"]  # e.g. http://grokflow-vnc-xxx:9223
        prompt_text = self._compose_prompt(job)

        # Chrome's /json/version returns wsEndpoint with Host we sent (localhost:9222
        # because nginx proxy rewrites Host to satisfy Chrome). Playwright would try
        # to connect to that literal URL and fail (ECONNREFUSED). Fetch + rewrite
        # the ws URL to point at our reverse proxy host:port.
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                resp = await c.get(f"{cdp_endpoint}/json/version")
                ws_url = resp.json().get("webSocketDebuggerUrl", "")
            if not ws_url:
                return JobResult(success=False, error_code="browser_crashed",
                                 error_message="No wsEndpoint from /json/version", retryable=True)
            # ws://localhost:9222/devtools/browser/<id> → ws://<container>:9223/devtools/browser/<id>
            host = cdp_endpoint.replace("http://", "").rstrip("/")
            ws_url = re.sub(r"ws://[^/]+", f"ws://{host}", ws_url)
        except Exception as exc:  # noqa: BLE001
            return JobResult(success=False, error_code="network_error",
                             error_message=f"CDP discovery: {exc}", retryable=True)

        page = None
        self._log(tag, "start: connect_over_cdp")
        try:
            async with async_playwright() as p:
                # Bigger CDP-connect timeout: when Chromium is overloaded the
                # initial WS handshake can take >5s. We catch PWTimeout below
                # and map to rate_limited (long backoff) instead of looping
                # immediately.
                try:
                    browser = await p.chromium.connect_over_cdp(ws_url, timeout=20000)
                except PWTimeout:
                    return JobResult(
                        success=False, error_code="rate_limited",
                        error_message="CDP connect timed out — Chromium is overloaded",
                        retryable=True,
                    )
                context = browser.contexts[0] if browser.contexts else None
                if not context:
                    await browser.close()
                    return JobResult(success=False, error_code="browser_crashed",
                                     error_message="No browser context found",
                                     retryable=True)

                # Stale-tab GC. CRITICAL constraints:
                #   1) Other concurrent worker tasks may be mid-evaluate on a
                #      tab — closing it surfaces as TargetClosedError.
                #   2) `await context.new_page()` returns a tab on
                #      about:blank for a few hundred ms before its goto()
                #      starts. We must NOT close those — another job may have
                #      just created it.
                # So the rule is: close only tabs that are clearly stale —
                # parked on a non-grok URL (e.g., abandoned redirect) OR on
                # grok.com with an empty body for some time. Skip about:blank
                # entirely; they're either brand new or already invisible.
                try:
                    pages = list(context.pages)
                    if len(pages) > 6:
                        gc_count = 0
                        for old in pages[:-6]:  # keep newest 6 untouched
                            try:
                                u = old.url or ""
                                if not u or u == "about:blank":
                                    continue  # skip — could be a fresh tab
                                if "grok.com" not in u and "x.ai" not in u:
                                    await old.close()
                                    gc_count += 1
                                    continue
                                # On grok.com — ping body. Tabs in active use
                                # have substantial content (the chat UI).
                                try:
                                    body_len = await old.evaluate(
                                        "() => (document.body && document.body.innerText || '').length",
                                        timeout=1500,
                                    )
                                except Exception:  # noqa: BLE001
                                    body_len = -1
                                # Only close if body is genuinely empty (broken)
                                # AND the URL has been on grok for a while.
                                if body_len == 0:
                                    await old.close()
                                    gc_count += 1
                            except Exception:  # noqa: BLE001
                                pass
                        if gc_count:
                            self._log(tag, f"tab-GC closed {gc_count} stale tab(s) (was {len(pages)})")
                except Exception:  # noqa: BLE001
                    pass

                page = await context.new_page()
                self._log(tag, "new tab opened")

                # Route to dedicated Imagine URL: /imagine for image, /imagine/video for video.
                target_url = self.GROK_IMAGINE_VIDEO if job.job_type == "video" else self.GROK_IMAGINE
                self._log(tag, f"goto {target_url}")
                # Serialize the goto step across concurrent jobs on this
                # Chromium — N parallel React boots can deadlock the renderer
                # and trigger ERR_ABORTED / TimeoutError storms.
                lock = _nav_lock(profile_id)
                try:
                    async with lock:
                        await page.goto(target_url, wait_until="domcontentloaded",
                                        timeout=self.NAV_TIMEOUT_MS)
                        await asyncio.sleep(2)  # let SPA render
                except PWTimeout:
                    # Navigation timeout means Chromium itself is overloaded.
                    # Mark this as rate_limited (longer backoff) so we don't
                    # immediately spawn another tab and worsen the cascade.
                    return JobResult(
                        success=False, error_code="rate_limited",
                        error_message=("Navigation timed out — Chromium is overloaded. "
                                       "Reduce profile.max_concurrent_jobs or wait."),
                        retryable=True,
                    )
                except Exception as exc:  # noqa: BLE001
                    msg = str(exc)
                    if "ERR_ABORTED" in msg or "ERR_FAILED" in msg or "net::" in msg:
                        return JobResult(
                            success=False, error_code="rate_limited",
                            error_message=f"Navigation aborted: {msg[:120]}",
                            retryable=True,
                        )
                    raise

                title = await page.title()
                if "Just a moment" in title or "Cloudflare" in title:
                    return JobResult(success=False, error_code="cookie_expired",
                                     error_message="Cloudflare challenge — re-login via Auto login")
                cur_url = page.url
                if any(kw in cur_url.lower() for kw in ("login", "sign-in", "signin", "auth")):
                    return JobResult(success=False, error_code="cookie_expired",
                                     error_message=f"Redirected to login: {cur_url}")

                content = (await page.content()).lower()
                if "captcha" in content:
                    return JobResult(success=False, error_code="captcha_required",
                                     error_message="Captcha detected")

                # Check for "Sign in / Sign up" buttons → not logged in
                body_text = await page.evaluate("() => document.body.innerText.slice(0, 200)")
                if "Sign in" in body_text and "Sign up" in body_text and not any(
                    "How can I help" in body_text and kw in body_text for kw in ()
                ):
                    # Likely not logged in — but Grok shows Sign in/up even when logged in sometimes
                    pass  # don't block; let it try

                # Dismiss cookie banner if present
                for label in ("Reject All", "Accept All Cookies", "Allow All"):
                    try:
                        btn = await page.query_selector(f"button:has-text('{label}')")
                        if btn and await btn.is_visible():
                            await btn.click()
                            await asyncio.sleep(0.5)
                            break
                    except Exception:  # noqa: BLE001
                        continue

                # Switch to Image / Video tab segmented control on Imagine.
                want_video = job.job_type == "video"
                try:
                    target_tab = "Video" if want_video else "Image"
                    await page.evaluate(
                        f"""(target) => {{
                            const btns = Array.from(document.querySelectorAll('button'));
                            const b = btns.find(b => (b.innerText||'').trim() === target && b.offsetParent !== null);
                            if (b) b.click();
                        }}""",
                        target_tab,
                    )
                    await asyncio.sleep(0.5)
                except Exception:  # noqa: BLE001
                    pass

                # Apply UI controls from options. Prefer explicit aspect/quality/
                # duration over the size-derived ratio.
                opts = job.options or {}
                ratio = opts.get("aspect") or self._size_to_ratio(opts.get("size") or "")
                if ratio:
                    try:
                        await self._set_aspect_ratio(page, ratio)
                        self._log(tag, f"aspect set to {ratio}")
                    except Exception as exc:  # noqa: BLE001
                        self._log(tag, f"aspect set failed: {exc}")
                quality = (opts.get("quality") or "").strip().lower()
                if quality in ("speed", "quality"):
                    try:
                        await self._set_segmented(page, "Speed" if quality == "speed" else "Quality")
                        self._log(tag, f"quality set to {quality}")
                    except Exception as exc:  # noqa: BLE001
                        self._log(tag, f"quality set failed: {exc}")
                if want_video and opts.get("duration"):
                    try:
                        await self._set_duration(page, int(opts["duration"]))
                        self._log(tag, f"duration set to {opts['duration']}s")
                    except Exception as exc:  # noqa: BLE001
                        self._log(tag, f"duration set failed: {exc}")

                prompt_el = await self._find_first(page, PROMPT_TEXTAREA, timeout_ms=15000)
                if not prompt_el:
                    prompt_el = await page.query_selector(".tiptap, .ProseMirror, [contenteditable='true']")
                if not prompt_el:
                    return JobResult(success=False, error_code="network_error",
                                     error_message="Prompt input not found — Grok UI changed",
                                     retryable=True)
                self._log(tag, "prompt input found")

                if job.attachments:
                    try:
                        await self._attach_files(page, job.attachments)
                        # Wait for the preview to render. Grok rebuilds the
                        # prompt-bar DOM after a successful upload, which
                        # invalidates our previous prompt_el handle.
                        await asyncio.sleep(2.5)
                        # Re-find the prompt input — old handle is now detached.
                        prompt_el = await self._find_first(
                            page, PROMPT_TEXTAREA, timeout_ms=10000,
                        ) or await page.query_selector(
                            ".tiptap.ProseMirror, .ProseMirror, [contenteditable='true']"
                        )
                        if not prompt_el:
                            return JobResult(
                                success=False, error_code="network_error",
                                error_message="Prompt input vanished after upload",
                                retryable=True,
                            )
                        self._log(tag, "input image attached, prompt re-resolved")
                    except Exception as exc:  # noqa: BLE001
                        return JobResult(success=False, error_code="network_error",
                                         error_message=f"Failed to attach input image: {exc}",
                                         retryable=True)

                seen_urls = await self._collect_image_urls(page)
                seen_video_urls = await self._collect_video_urls(page)

                # ProseMirror is a controlled contenteditable — clearing
                # innerHTML breaks its internal state, so we use a `paste` event
                # which ProseMirror handles natively (transactionally inserts
                # text into its document model and updates React state).
                #
                # `click()` sets the cursor inside the editor (ProseMirror's
                # view.focus()), and dispatching paste targets THIS page's CDP
                # session so concurrent tabs don't interfere with each other.
                try:
                    await prompt_el.click()
                except Exception:  # noqa: BLE001
                    await prompt_el.focus()
                await asyncio.sleep(0.1)

                injected = await page.evaluate(
                    """(args) => {
                        const [el, text] = args;
                        if (!el) return false;
                        // First select-all + delete via execCommand so the new paste
                        // replaces (not appends) any leftover content.
                        try { document.execCommand('selectAll', false); } catch (e) {}
                        try { document.execCommand('delete', false); } catch (e) {}
                        // Construct a synthetic paste event ProseMirror will accept.
                        const dt = new DataTransfer();
                        dt.setData('text/plain', text);
                        const ev = new ClipboardEvent('paste', {
                            bubbles: true, cancelable: true, clipboardData: dt,
                        });
                        try { el.focus(); } catch (e) {}
                        const ok = el.dispatchEvent(ev);
                        // Some builds of ProseMirror only listen on the inner editor; fall
                        // back to dispatching on the deepest contenteditable child too.
                        const inner = el.querySelector('[contenteditable=\"true\"]') || el;
                        if (inner !== el) inner.dispatchEvent(ev);
                        return ok;
                    }""",
                    [prompt_el, prompt_text],
                )
                self._log(tag, f"prompt injected via paste (len={len(prompt_text)}, ok={injected})")
                await asyncio.sleep(0.4)

                # Verify ProseMirror actually accepted the paste. If empty, try
                # a keyboard.insert_text fallback (works on logged-in editor
                # without ProseMirror clipboard handlers).
                pm_text = await page.evaluate(
                    """() => {
                        const pm = document.querySelector('.tiptap.ProseMirror, .ProseMirror');
                        return pm ? (pm.innerText || '').trim() : '';
                    }"""
                )
                if not pm_text:
                    self._log(tag, "paste produced empty PM, trying insert_text fallback")
                    try:
                        await prompt_el.focus()
                        await asyncio.sleep(0.1)
                        await page.keyboard.insert_text(prompt_text)
                        await asyncio.sleep(0.3)
                        pm_text = await page.evaluate(
                            """() => {
                                const pm = document.querySelector('.tiptap.ProseMirror, .ProseMirror');
                                return pm ? (pm.innerText || '').trim() : '';
                            }"""
                        )
                    except Exception:  # noqa: BLE001
                        pass

                if not pm_text:
                    # Detect logged-out state: page shows Sign in/Sign up AND
                    # editor is empty after a paste event → almost certainly
                    # session expired. Worker will mark profile need_login.
                    body_txt = await page.evaluate("() => (document.body.innerText || '').slice(0, 500)")
                    if "Sign in" in body_txt and "Sign up" in body_txt:
                        return JobResult(
                            success=False, error_code="cookie_expired",
                            error_message="Grok session expired — admin must Auto-login this profile.",
                        )
                    return JobResult(
                        success=False, error_code="network_error",
                        error_message="Failed to inject prompt into ProseMirror editor",
                        retryable=True,
                    )

                # Wait for Submit button to become enabled.
                submit_btn = None
                for _ in range(20):
                    submit_btn = await page.query_selector("button[aria-label='Submit']:not([disabled])")
                    if submit_btn:
                        break
                    await asyncio.sleep(0.5)
                submitted = False
                if submit_btn:
                    try:
                        # 5s instead of Playwright's default 30s. When the
                        # click handler is starved we'd rather bail and use
                        # the keyboard Enter fallback below than block the
                        # whole job for 30s.
                        await submit_btn.click(timeout=5000)
                        submitted = True
                        self._log(tag, "submit clicked")
                    except Exception as exc:  # noqa: BLE001
                        self._log(tag, f"submit click failed: {exc}")
                if not submitted:
                    # Last resort: keyboard Enter on the prompt element.
                    try:
                        await prompt_el.focus()
                        await page.keyboard.press("Enter")
                        self._log(tag, "submit via Enter fallback")
                    except Exception:  # noqa: BLE001
                        return JobResult(success=False, error_code="timeout",
                                         error_message="Submit button never enabled — prompt may not have registered",
                                         retryable=True)

                # Poll BOTH images and videos simultaneously. For video jobs we
                # care about <video> elements with non-empty src; for image jobs
                # we care about <img> elements. Track stability separately.
                want_video = job.job_type == "video"
                # Adaptive timeout + stability window. Image jobs finish fast
                # so we lock in the result aggressively (3s after first image).
                # Video jobs may stream multiple thumbnail updates so we wait
                # a bit longer for the URL set to settle.
                timeout_ms = self.VIDEO_TIMEOUT_MS if want_video else self.IMAGE_TIMEOUT_MS
                deadline = time.monotonic() + timeout_ms / 1000
                STABILITY_SECONDS = 6.0 if want_video else 3.0
                last_change_at: float | None = None
                new_urls_set: set[str] = set()
                new_video_urls: set[str] = set()

                rate_limit_detected: str | None = None
                pro_required_detected: str | None = None
                next_text_check = time.monotonic()  # cheap text check ~every 6s
                next_progress_log = time.monotonic() + 15

                while time.monotonic() < deadline:
                    cur_imgs = await self._collect_image_urls(page) - seen_urls
                    cur_vids = await self._collect_video_urls(page) - seen_video_urls

                    changed = False
                    if want_video and cur_vids and cur_vids != new_video_urls:
                        new_video_urls = cur_vids
                        changed = True
                    if cur_imgs and cur_imgs != new_urls_set:
                        new_urls_set = cur_imgs
                        changed = True

                    if changed:
                        last_change_at = time.monotonic()

                    target_set = new_video_urls if want_video else new_urls_set
                    if target_set and last_change_at and (time.monotonic() - last_change_at) >= STABILITY_SECONDS:
                        # Got media + stable for STABILITY window → done.
                        break

                    if time.monotonic() >= next_progress_log:
                        next_progress_log = time.monotonic() + 30
                        self._log(tag, f"polling… imgs={len(new_urls_set)} vids={len(new_video_urls)} elapsed={int(time.monotonic() - (deadline - timeout_ms/1000))}s")

                    # Periodic rate-limit / Pro-required text scan.
                    if time.monotonic() >= next_text_check:
                        next_text_check = time.monotonic() + 6
                        try:
                            text = (await page.evaluate(
                                "() => (document.body.innerText || '').slice(-2000)"
                            )).lower()
                        except Exception:  # noqa: BLE001
                            text = ""
                        for hint in RATE_LIMIT_HINTS:
                            if hint in text:
                                rate_limit_detected = hint
                                break
                        if not rate_limit_detected:
                            for hint in PRO_REQUIRED_HINTS:
                                if hint in text:
                                    pro_required_detected = hint
                                    break
                        if rate_limit_detected or pro_required_detected:
                            break

                    # Tight poll loop — 1s catches new image URLs sooner.
                    await asyncio.sleep(1)

                if rate_limit_detected and not (new_urls_set or new_video_urls):
                    return JobResult(
                        success=False, error_code="rate_limited",
                        error_message=f"Grok account rate-limited: '{rate_limit_detected}'. Wait or use a different profile.",
                        retryable=True,
                    )
                if pro_required_detected and not (new_urls_set or new_video_urls):
                    return JobResult(
                        success=False, error_code="provider_blocked",
                        error_message=f"Grok account lacks required subscription: '{pro_required_detected}'.",
                        retryable=False,
                    )

                if not new_urls_set and not new_video_urls:
                    err_msg = "No new media within timeout"
                    if want_video:
                        err_msg += " (Grok video may need Pro/Heavy subscription)"
                    return JobResult(success=False, error_code="timeout",
                                     error_message=err_msg, retryable=True)

                # Video preset (Fun / Custom / Spicy) — Grok shows these as a
                # row of buttons under the rendered video. Clicking one
                # triggers a regenerate at the new preset; we wait for the
                # NEW URL set then keep ONLY the regenerated videos.
                mode = (opts.get("mode") or "").strip().lower()
                if want_video and new_video_urls and mode and mode != "normal":
                    label_map = {
                        "fun":    ["Fun"],
                        "custom": ["Custom"],
                        "spicy":  ["Spicy", "Spicy mode", "18+"],
                    }
                    targets = label_map.get(mode, [])
                    clicked = False
                    if targets:
                        try:
                            clicked = await page.evaluate(
                                """(targets) => {
                                    const visible = (e) => e && e.offsetParent !== null;
                                    const all = Array.from(document.querySelectorAll(
                                      'button, [role=button], [role=tab], [role=radio]'
                                    ));
                                    for (const t of targets) {
                                      const m = all.find(e => (e.innerText || '').trim() === t && visible(e));
                                      if (m && !m.disabled) { m.click(); return t; }
                                    }
                                    return null;
                                }""",
                                targets,
                            )
                        except Exception:  # noqa: BLE001
                            clicked = False
                    if clicked:
                        self._log(tag, f"video preset '{clicked}' clicked, awaiting regen")
                        before = set(new_video_urls)
                        regen_deadline = time.monotonic() + 180  # 3 min cap
                        regen_stable: float | None = None
                        regen_set: set[str] = set()
                        while time.monotonic() < regen_deadline:
                            cur = await self._collect_video_urls(page)
                            new = cur - before - seen_video_urls
                            if new and new != regen_set:
                                regen_set = new
                                regen_stable = time.monotonic()
                            if regen_set and regen_stable and (time.monotonic() - regen_stable) >= 6.0:
                                break
                            await asyncio.sleep(2)
                        if regen_set:
                            self._log(tag, f"preset regen produced {len(regen_set)} new video(s)")
                            new_video_urls = regen_set  # keep ONLY the preset version
                        else:
                            self._log(tag, f"preset '{mode}' clicked but no new video — falling back to original")
                    else:
                        self._log(tag, f"preset '{mode}' button not available (account tier?)")

                cookies = await context.cookies()
                jar = httpx.Cookies()
                for c in cookies:
                    jar.set(c["name"], c["value"], domain=c.get("domain", ""), path=c.get("path", "/"))
                ua = await page.evaluate("() => navigator.userAgent")

                downloaded: list[ResultFile] = []
                async with httpx.AsyncClient(cookies=jar, follow_redirects=True, timeout=120) as client:
                    # Download videos first (priority for video jobs)
                    for idx, vurl in enumerate(sorted(new_video_urls)):
                        try:
                            resp = await client.get(vurl, headers={"Referer": target_url, "User-Agent": ua})
                            if resp.status_code != 200:
                                continue
                            mime = resp.headers.get("content-type", "video/mp4").split(";")[0].strip()
                            ext = "mp4" if "mp4" in mime else "webm"
                            downloaded.append(ResultFile(
                                bytes=resp.content,
                                name=f"grok_video_{int(time.time())}_{idx + 1}.{ext}",
                                mime=mime,
                                source_url=vurl,
                            ))
                        except Exception:  # noqa: BLE001
                            continue
                    # Then images (could be input preview echoed back, or output)
                    for idx, img_url in enumerate(sorted(new_urls_set)):
                        try:
                            resp = await client.get(img_url, headers={"Referer": target_url, "User-Agent": ua})
                            if resp.status_code != 200:
                                continue
                            mime = resp.headers.get("content-type", "image/png").split(";")[0].strip()
                            ext = self._ext_for_mime(mime)
                            downloaded.append(ResultFile(
                                bytes=resp.content,
                                name=f"grok_image_{int(time.time())}_{idx + 1}.{ext}",
                                mime=mime,
                                source_url=img_url,
                            ))
                        except Exception:  # noqa: BLE001
                            continue

                if not downloaded:
                    return JobResult(success=False, error_code="network_error",
                                     error_message="All media downloads failed",
                                     retryable=True)

                return JobResult(
                    success=True,
                    files=downloaded,
                    extra={
                        "image_count": len(new_urls_set),
                        "video_count": len(new_video_urls),
                        "source_urls": list(new_urls_set | new_video_urls),
                    },
                )

        except PWTimeout as e:
            return JobResult(success=False, error_code="timeout",
                             error_message=str(e), retryable=True)
        except Exception as exc:  # noqa: BLE001
            return JobResult(success=False, error_code="unknown_error",
                             error_message=f"{type(exc).__name__}: {exc}", retryable=True)
        finally:
            # Always close the per-job tab so memory is released — keeps Chromium
            # available for next job. The browser object itself is just a CDP
            # connection; closing it doesn't kill the underlying Chromium.
            if page is not None:
                try:
                    await page.close()
                except Exception:  # noqa: BLE001
                    pass

    @staticmethod
    async def _collect_image_urls(page) -> set[str]:
        # ONLY match URLs from Grok's generated-output CDN. We deliberately
        # exclude `assets.grok.com/users/.../content` because that pattern
        # also covers the user's saved gallery, attached upload previews,
        # and "Most recent favorite" lookback — all of which would be picked
        # up as false-positive results (especially fatal for image-to-image
        # where the upload preview matches the same prefix as past favorites).
        #
        # Newly generated images live exclusively under:
        #   imagine-public.x.ai/imagine-public/images/<uuid>.jpg
        urls = await page.evaluate(
            """() => {
                const out = new Set();
                const generatedHostPatterns = [
                    /imagine-public\\.x\\.ai\\/imagine-public\\/images\\//,
                    /imgen\\./,  // legacy Grok output
                ];
                const exclude = [
                    /avatar/i, /emoji/i,
                    /cookielaw|onetrust/i,
                    /share-images\\//,        // template gallery decoration
                    /share-videos\\/.*thumbnail/, // public video thumbs
                ];
                document.querySelectorAll('img').forEach(i => {
                    const s = i.src || '';
                    if (!s.startsWith('http')) return;
                    if (exclude.some(rx => rx.test(s) || rx.test(i.alt || ''))) return;
                    if (generatedHostPatterns.some(rx => rx.test(s))) {
                        out.add(s);
                    }
                });
                return Array.from(out);
            }"""
        )
        return set(urls)

    @staticmethod
    async def _collect_video_urls(page) -> set[str]:
        urls = await page.evaluate(
            """() => {
                const out = new Set();
                document.querySelectorAll('video, video source').forEach(v => {
                    const s = v.src || (v.currentSrc) || '';
                    if (s.startsWith('http')) out.add(s);
                });
                document.querySelectorAll('a[href*=".mp4"], a[href*=".webm"]').forEach(a => {
                    if (a.href.startsWith('http')) out.add(a.href);
                });
                return Array.from(out);
            }"""
        )
        return set(urls)

    @staticmethod
    def _size_to_ratio(size: str) -> str | None:
        """Convert 1024x576 → '16:9', 1024x1024 → '1:1', etc."""
        try:
            w, h = (int(x) for x in size.split("x"))
        except (ValueError, ZeroDivisionError):
            return None
        candidates = {
            (1, 1): "1:1",
            (16, 9): "16:9", (9, 16): "9:16",
            (4, 3): "4:3", (3, 4): "3:4",
            (3, 2): "3:2", (2, 3): "2:3",
        }
        actual = w / h
        best = None
        best_diff = 999.0
        for (rw, rh), name in candidates.items():
            diff = abs((rw / rh) - actual)
            if diff < best_diff:
                best_diff = diff
                best = name
        return best

    @staticmethod
    async def _set_aspect_ratio(page, ratio: str) -> None:
        """Open Aspect Ratio popover, click target, then ALWAYS close popover.

        The popover (radix-popper) intercepts pointer events when open. If we
        leave it open, subsequent clicks (Submit, tiptap focus) fail with
        "subtree intercepts pointer events". Press Escape unconditionally.
        """
        btn = await page.query_selector("button[aria-label='Aspect Ratio']")
        if not btn:
            return
        try:
            await btn.click()
            await asyncio.sleep(0.7)
            # Map our short ratios to Grok's likely option labels.
            label_candidates = {
                "1:1": ["1:1", "Square"],
                "16:9": ["16:9", "Widescreen", "Landscape"],
                "9:16": ["9:16", "Portrait", "Vertical"],
                "4:3": ["4:3"],
                "3:4": ["3:4"],
                "3:2": ["3:2"],
                "2:3": ["2:3"],
            }
            targets = label_candidates.get(ratio, [ratio])
            await page.evaluate(
                """(targets) => {
                    const els = Array.from(document.querySelectorAll('[role=menuitem], [role=option], button, span'));
                    for (const t of targets) {
                        const m = els.find(e => (e.innerText || '').trim() === t && e.offsetParent !== null);
                        if (m) { m.click(); return true; }
                    }
                    return false;
                }""",
                targets,
            )
            await asyncio.sleep(0.3)
        finally:
            # Always dismiss any lingering popover so it doesn't block the page.
            try:
                await page.keyboard.press("Escape")
                await page.keyboard.press("Escape")
                await asyncio.sleep(0.2)
            except Exception:  # noqa: BLE001
                pass

    @staticmethod
    async def _set_segmented(page, label: str) -> None:
        """Click a Grok segmented-control button by exact label text.

        Used for Speed/Quality, Image/Video, and similar toggles. JS-based
        click works per-tab and doesn't depend on OS keyboard focus.
        """
        await page.evaluate(
            """(target) => {
                const visible = (el) => el && el.offsetParent !== null;
                const btns = Array.from(document.querySelectorAll('button, [role="tab"], [role="radio"]'));
                const b = btns.find(b => (b.innerText || '').trim() === target && visible(b));
                if (b) { b.click(); return true; }
                return false;
            }""",
            label,
        )
        await asyncio.sleep(0.4)

    @staticmethod
    async def _set_duration(page, seconds: int) -> None:
        """Click a duration option (e.g., 6s/15s) on Grok video controls."""
        target_labels = [f"{seconds}s", f"{seconds} sec", f"{seconds} seconds", str(seconds)]
        await page.evaluate(
            """(targets) => {
                const visible = (el) => el && el.offsetParent !== null;
                const els = Array.from(document.querySelectorAll('button, [role=menuitem], [role=option], [role=radio]'));
                for (const t of targets) {
                    const m = els.find(e => (e.innerText || '').trim() === t && visible(e));
                    if (m) { m.click(); return true; }
                }
                return false;
            }""",
            target_labels,
        )
        await asyncio.sleep(0.3)

    @staticmethod
    async def _attach_files(page, attachments: list) -> None:
        """Attach reference images on Grok Imagine.

        Grok keeps a hidden <input type='file' name='files' accept='image/*'>
        inside the prompt-bar form, plus a visible 'Upload' button (legacy
        builds called it 'Attach') that opens the OS file chooser. We try the
        direct hidden-input path first because it's resilient to UI shuffles.
        """
        import os
        import tempfile

        tmp_paths: list[str] = []
        for att in attachments:
            fd, path = tempfile.mkstemp(prefix="grokflow_in_", suffix=f"_{att.name}")
            try:
                with os.fdopen(fd, "wb") as f:
                    f.write(att.bytes)
                tmp_paths.append(path)
            except Exception:
                os.close(fd)
                raise

        # Path A: hidden input set_input_files. Works for current Grok layout
        # (input is class='hidden' but visible to Playwright).
        last_err: Exception | None = None
        for sel in (
            "input[type='file'][name='files']",
            "input[type='file'][accept*='image']",
            "input[type='file']",
        ):
            try:
                el = await page.query_selector(sel)
                if el:
                    await el.set_input_files(tmp_paths)
                    return
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                continue

        # Path B: trigger file chooser by clicking Upload/Attach button.
        for label in ("Upload", "Attach", "Add image", "Add file"):
            btn = await page.query_selector(f"button[aria-label='{label}']")
            if not btn:
                continue
            try:
                async with page.expect_file_chooser(timeout=5000) as fc_info:
                    await btn.click()
                chooser = await fc_info.value
                await chooser.set_files(tmp_paths)
                return
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                continue

        raise RuntimeError(
            f"No upload affordance found on Grok UI (last error: {last_err})"
        )

    @staticmethod
    def _compose_prompt(job: JobInput) -> str:
        opts = job.options or {}
        prompt = job.prompt.strip()
        hints = []
        size = opts.get("size")
        if size and not re.search(r"\d+x\d+|\d+:\d+", prompt):
            try:
                w, h = (int(x) for x in size.split("x"))
                if abs(w - h) < 10:
                    hints.append("square 1:1 aspect")
                elif w > h:
                    hints.append("16:9 landscape")
                else:
                    hints.append("9:16 portrait")
            except (ValueError, ZeroDivisionError):
                hints.append(f"size {size}")
        style = opts.get("style")
        if style and style != "natural":
            hints.append(f"{style} style")
        n = opts.get("n", 1)
        if n and n > 1:
            hints.append(f"generate {n} variations")
        if hints:
            prompt = f"{prompt} ({', '.join(hints)})"
        return prompt

    @staticmethod
    def _ext_for_mime(mime: str) -> str:
        return {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp",
            "image/gif": "gif",
        }.get(mime.lower(), "bin")

    @staticmethod
    async def _find_first(page, selectors: list[str], timeout_ms: int):
        for sel in selectors:
            try:
                el = await page.wait_for_selector(sel, timeout=timeout_ms, state="visible")
                if el:
                    return el
            except PWTimeout:
                continue
        return None
