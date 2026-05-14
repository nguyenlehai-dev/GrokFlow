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
- Image event: `result.response.cardAttachment.jsonData` (stringified JSON)
  whose `image_chunk.imageUrl` carries the final asset path when `progress=100`.
- Video event: `result.response.streamingVideoGenerationResponse.videoUrl`
  appears when `progress=100`.
- `result.response.isSoftStop=true` marks end of stream.
- Asset URL is RELATIVE; full URL is https://assets.grok.com/<assetUrl>.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Callable

import httpx

GROK_BASE = "https://grok.com"
ASSETS_BASE = "https://assets.grok.com"
ENDPOINT_NEW_CONVERSATION = "/rest/app-chat/conversations/new"

# Pinned body fields for IMAGE jobs, from a verified working request.
_IMAGE_BODY: dict[str, Any] = {
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


# Type for the per-stream event extractor. Returns the asset URL to download
# when an event signals "asset finished", else None.
EventExtractor = Callable[[dict], str | None]


class GrokAPIClient:
    """One-shot client for /conversations/new. Build per-job to avoid stale state.

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

    def _headers(self, referer_path: str) -> dict[str, str]:
        # Referer matters: project-scoped image responses are gated on
        # `referer` pointing at the workspace; video responses on the
        # Imagine studio URL. Both are computed by the caller.
        h = {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/json",
            "origin": GROK_BASE,
            "referer": f"{GROK_BASE}{referer_path}",
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
        """Submit `/imagine <prompt>` and return the bytes of every completed image."""
        body = dict(_IMAGE_BODY)
        body["message"] = (
            prompt if prompt.lstrip().startswith("/imagine") else f"/imagine {prompt}"
        )
        body["workspaceIds"] = [project_id] if project_id else []

        referer_path = f"/project/{project_id}" if project_id else "/"
        return await self._submit_and_collect(
            body=body,
            referer_path=referer_path,
            extract_asset=_extract_image_url,
            asset_label="image_chunk",
            log=log,
        )

    async def videoize(
        self,
        prompt: str,
        *,
        aspect_ratio: str = "3:2",
        resolution: str = "720p",
        duration: int = 10,
        mode: str = "custom",
        log: Callable[[str], None] | None = None,
    ) -> list[bytes]:
        """Submit a video-generation request and return the bytes of the .mp4."""
        # Strip any leading slash command — videoize uses --mode= suffix instead.
        clean_prompt = prompt.lstrip()
        if clean_prompt.startswith("/imagine"):
            clean_prompt = clean_prompt[len("/imagine"):].lstrip()
        message = f"{clean_prompt} --mode={mode}"

        # The frontend generates a fresh UUID for the post; server reuses it
        # as the videoPostId. parentPostId == this id means "fresh generation"
        # (not a remix or extension).
        post_id = str(uuid.uuid4())

        body = {
            "temporary": True,
            "modelName": "imagine-video-gen",
            "message": message,
            "enableSideBySide": True,
            "responseMetadata": {
                "experiments": [],
                "modelConfigOverride": {
                    "modelMap": {
                        "videoGenModelConfig": {
                            "parentPostId": post_id,
                            "aspectRatio": aspect_ratio,
                            "videoLength": duration,
                            "resolutionName": resolution,
                        }
                    }
                },
            },
        }
        return await self._submit_and_collect(
            body=body,
            referer_path="/imagine",
            extract_asset=_extract_video_url,
            asset_label="video_chunk",
            log=log,
        )

    async def _submit_and_collect(
        self,
        *,
        body: dict[str, Any],
        referer_path: str,
        extract_asset: EventExtractor,
        asset_label: str,
        log: Callable[[str], None] | None,
    ) -> list[bytes]:
        """POST to /conversations/new, stream-parse, download final assets."""

        def _emit(msg: str) -> None:
            if log:
                log(msg)

        urls: list[str] = []
        soft_stopped = False

        async with httpx.AsyncClient(
            timeout=self.timeout, cookies=self.cookies, follow_redirects=True
        ) as client:
            try:
                async with client.stream(
                    "POST",
                    GROK_BASE + ENDPOINT_NEW_CONVERSATION,
                    headers=self._headers(referer_path),
                    json=body,
                ) as resp:
                    if resp.status_code == 401:
                        raise GrokAPIError(
                            "cookie_expired",
                            "401 from /conversations/new — session cookie invalid",
                        )
                    if resp.status_code == 403:
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
                            "unknown_error", f"{resp.status_code}: {snippet!r}"
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
                            url = extract_asset(evt)
                            if url and url not in urls:
                                urls.append(url)
                                _emit(f"{asset_label} done: {url}")
                            response = (evt.get("result") or {}).get("response") or {}
                            if response.get("isSoftStop"):
                                soft_stopped = True
                        if last_end:
                            buf = buf[last_end:]
                        if soft_stopped and urls:
                            break
            except httpx.HTTPError as exc:
                raise GrokAPIError(
                    "network_error", f"HTTP error: {exc}", retryable=True
                ) from exc

            if not urls:
                raise GrokAPIError(
                    "unknown_error",
                    f"stream ended without a completed {asset_label}",
                    retryable=True,
                )

            # Download each asset. Reusing the same cookie jar lets
            # assets.grok.com authorize the fetch under the user's session
            # (the URL contains the user UUID).
            results: list[bytes] = []
            for url in urls:
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
                    "unknown_error", "all asset downloads failed", retryable=True
                )
            return results


def _extract_image_url(evt: dict) -> str | None:
    """Return imageUrl from a completed image_chunk event."""
    response = (evt.get("result") or {}).get("response") or {}
    card = response.get("cardAttachment")
    if not card:
        return None
    try:
        data = json.loads(card.get("jsonData", "{}"))
    except json.JSONDecodeError:
        return None
    ic = data.get("image_chunk") or {}
    url = ic.get("imageUrl")
    if url and ic.get("progress") == 100:
        return url
    return None


def _extract_video_url(evt: dict) -> str | None:
    """Return videoUrl from a completed streamingVideoGenerationResponse event."""
    response = (evt.get("result") or {}).get("response") or {}
    vg = response.get("streamingVideoGenerationResponse")
    if not vg:
        return None
    if vg.get("progress") != 100:
        return None
    return vg.get("videoUrl")
