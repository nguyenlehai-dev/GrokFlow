"""HTTP-only Grok client — replaces Playwright DOM automation for /imagine.

Why this exists:
- Playwright + VNC Chromium per profile costs ~800 MB RAM and is brittle to
  Grok UI changes. The real chat backend is a plain HTTPS endpoint that
  accepts cookies; replaying the request directly drops RAM to ~0 and removes
  every DOM-selector failure mode.

How cookies arrive here:
- The worker keeps a Playwright connection to the per-profile VNC Chromium
  for login bootstrap. Once admin Auto-logged in, the cookies needed
  (`sso`, `sso-rw`, `cf_clearance`, `__cf_bm`, `x-userid`) live in that
  browser context. The provider pulls them with `context.cookies(...)` and
  hands them in here.

Stream format (captured from devtools 2026-05-14):
- Response is a sequence of CONCATENATED JSON objects (no SSE framing).
- Each object has `result.response.cardAttachment.jsonData` (stringified JSON)
  whose `image_chunk.imageUrl` carries the final asset path when `progress=100`.
- `result.response.isSoftStop=true` marks end of stream.
- Asset URL is RELATIVE; full URL is https://assets.grok.com/<imageUrl>.
"""

from __future__ import annotations

import json
from typing import Any, Callable

import httpx

GROK_BASE = "https://grok.com"
ASSETS_BASE = "https://assets.grok.com"
ENDPOINT_NEW_CONVERSATION = "/rest/app-chat/conversations/new"

# Pinned body fields from a verified working request. If Grok adds required
# fields we'll see 4xx — bump these and ship.
_DEFAULT_BODY: dict[str, Any] = {
    "temporary": False,
    "fileAttachments": [],
    "imageAttachments": [],
    "disableSearch": False,
    "enableImageGeneration": True,
    "returnImageBytes": False,
    "returnRawGrokInXaiRequest": False,
    "enableImageStreaming": True,
    "imageGenerationCount": 2,
    "forceConcise": False,
    "enableSideBySide": True,
    "sendFinalMetadata": True,
    "disableTextFollowUps": False,
    "responseMetadata": {},
    "disableMemory": False,
    "forceSideBySide": False,
    "isAsyncChat": False,
    "disableSelfHarmShortCircuit": False,
    "collectionIds": [],
    "disabledConnectorIds": [],
    "deviceEnvInfo": {
        "darkModeEnabled": False,
        "devicePixelRatio": 1,
        "screenWidth": 1920,
        "screenHeight": 1080,
        "viewportWidth": 1920,
        "viewportHeight": 533,
    },
    "modeId": "fast",
}


class GrokAPIError(Exception):
    """Maps to provider ERROR_CODES so the worker can decide retry vs requeue."""

    def __init__(self, code: str, message: str, retryable: bool = False):
        self.code = code
        self.message = message
        self.retryable = retryable
        super().__init__(message)


def _iter_complete_json(buf: str):
    """Yield `(obj_text, end_index)` for each top-level `{...}` in `buf`.

    Grok streams concatenated JSON objects with no separator — brace-depth
    tracking with a string-state guard is the safe way to split them without
    accidentally splitting inside a string that contains `{` or `}`.
    """
    depth = 0
    in_str = False
    escape = False
    start = -1
    for i, ch in enumerate(buf):
        if escape:
            escape = False
            continue
        if in_str:
            if ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth == 0:
                continue
            depth -= 1
            if depth == 0 and start >= 0:
                yield buf[start:i + 1], i + 1
                start = -1


class GrokAPIClient:
    """One-shot client for an /imagine call. Build per-job to avoid stale state.

    Caller supplies cookies (a dict mapping cookie name → value) and the UA
    string the live profile is using; both come from the Playwright context.
    """

    def __init__(
        self,
        cookies: dict[str, str],
        user_agent: str,
        x_statsig_id: str | None = None,
        timeout: float = 180.0,
    ):
        self.cookies = cookies
        self.user_agent = user_agent
        self.x_statsig_id = x_statsig_id
        self.timeout = timeout

    def _headers(self, project_id: str | None) -> dict[str, str]:
        # Referer matters: project-scoped responses are gated on `referer`
        # pointing at the workspace, and the body's workspaceIds must match.
        referer = (
            f"{GROK_BASE}/project/{project_id}"
            if project_id
            else f"{GROK_BASE}/"
        )
        h = {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/json",
            "origin": GROK_BASE,
            "referer": referer,
            "user-agent": self.user_agent,
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
        }
        if self.x_statsig_id:
            h["x-statsig-id"] = self.x_statsig_id
        return h

    async def imagine(
        self,
        prompt: str,
        project_id: str | None = None,
        log: Callable[[str], None] | None = None,
    ) -> list[bytes]:
        """Submit `/imagine <prompt>` and return the bytes of every completed image.

        Raises GrokAPIError with a code matching ERROR_CODES.
        """
        body = dict(_DEFAULT_BODY)
        body["message"] = (
            prompt if prompt.lstrip().startswith("/imagine") else f"/imagine {prompt}"
        )
        body["workspaceIds"] = [project_id] if project_id else []

        image_urls: list[str] = []
        soft_stopped = False

        def _emit(msg: str) -> None:
            if log:
                log(msg)

        async with httpx.AsyncClient(
            timeout=self.timeout, cookies=self.cookies, follow_redirects=True
        ) as client:
            try:
                async with client.stream(
                    "POST",
                    GROK_BASE + ENDPOINT_NEW_CONVERSATION,
                    headers=self._headers(project_id),
                    json=body,
                ) as resp:
                    if resp.status_code == 401:
                        raise GrokAPIError(
                            "cookie_expired",
                            "401 from /conversations/new — session cookie invalid",
                        )
                    if resp.status_code == 403:
                        # cf_clearance expired or x-statsig-id rejected. Caller
                        # should fall back to Playwright which can refresh.
                        raise GrokAPIError(
                            "provider_blocked",
                            "403 — Cloudflare or statsig challenge",
                            retryable=True,
                        )
                    if resp.status_code == 429:
                        raise GrokAPIError(
                            "rate_limited", "429 — Grok rate limit", retryable=True
                        )
                    if resp.status_code >= 400:
                        snippet = (await resp.aread())[:200]
                        raise GrokAPIError(
                            "unknown_error",
                            f"{resp.status_code}: {snippet!r}",
                        )

                    buf = ""
                    async for chunk in resp.aiter_text():
                        buf += chunk
                        last_end = 0
                        for obj_text, end in _iter_complete_json(buf):
                            last_end = end
                            try:
                                evt = json.loads(obj_text)
                            except json.JSONDecodeError:
                                continue
                            self._handle_event(evt, image_urls, _emit)
                            response = (
                                evt.get("result", {}).get("response", {})
                            )
                            if response.get("isSoftStop"):
                                soft_stopped = True
                        if last_end:
                            buf = buf[last_end:]
                        # Once stream signals stop AND we have a finished image,
                        # short-circuit — saves up to ~10s of trailing tokens.
                        if soft_stopped and image_urls:
                            break
            except httpx.HTTPError as exc:
                raise GrokAPIError(
                    "network_error", f"HTTP error: {exc}", retryable=True
                ) from exc

            if not image_urls:
                raise GrokAPIError(
                    "unknown_error",
                    "stream ended without a completed image_chunk",
                    retryable=True,
                )

            # Asset URLs are relative — download each. Reusing the same cookie
            # jar lets assets.grok.com authorize the fetch under the user's
            # session (the URL contains the user UUID).
            results: list[bytes] = []
            for url in image_urls:
                full = f"{ASSETS_BASE}/{url.lstrip('/')}"
                try:
                    r = await client.get(
                        full,
                        headers={
                            "user-agent": self.user_agent,
                            "referer": f"{GROK_BASE}/",
                        },
                    )
                except httpx.HTTPError as exc:
                    _emit(f"asset fetch failed {full}: {exc}")
                    continue
                if r.status_code != 200:
                    _emit(f"asset {full} → HTTP {r.status_code}")
                    continue
                results.append(r.content)
            if not results:
                raise GrokAPIError(
                    "unknown_error",
                    "all asset downloads failed",
                    retryable=True,
                )
            return results

    @staticmethod
    def _handle_event(
        evt: dict, image_urls: list[str], emit: Callable[[str], None]
    ) -> None:
        response = (evt.get("result") or {}).get("response") or {}
        card = response.get("cardAttachment")
        if not card:
            return
        try:
            data = json.loads(card.get("jsonData", "{}"))
        except json.JSONDecodeError:
            return
        ic = data.get("image_chunk") or {}
        url = ic.get("imageUrl")
        progress = ic.get("progress")
        if url and progress == 100 and url not in image_urls:
            image_urls.append(url)
            emit(f"image_chunk done: {url}")
