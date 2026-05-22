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

import asyncio
import base64
import json
import os
import time
import uuid
from typing import Any, Callable

import httpx

GROK_BASE = "https://grok.com"
ASSETS_BASE = "https://assets.grok.com"
ENDPOINT_NEW_CONVERSATION = "/rest/app-chat/conversations/new"
ENDPOINT_UPLOAD_FILE = "/rest/app-chat/upload-file"


def _httpx_proxy_kwargs() -> dict:
    """Build the proxy kwargs for an httpx client from GROK_HTTP_PROXY.

    When the env var is set (typically by the backend container's
    warp-bootstrap.sh after WARP binds 127.0.0.1:40000), all outbound
    grok.com traffic goes through Cloudflare's WARP network →
    Cloudflare's bot wall sees the request as coming from its own
    infrastructure and skips the harder challenges that the bare VPS
    IP attracts. Empty env = direct connection (legacy behavior).
    """
    proxy = os.environ.get("GROK_HTTP_PROXY")
    return {"proxy": proxy} if proxy else {}

# Pinned body fields for plain text-chat (no image gen), captured from a
# real /conversations/new request that produced a streamed text reply.
# Same shape as image but with enableImageGeneration off and
# imageGenerationCount=0 — Grok then runs the text-completion path
# instead of the diffusion pipeline.
_CHAT_BODY: dict[str, Any] = {
    "temporary": False,
    "fileAttachments": [],
    "imageAttachments": [],
    "disableSearch": False,
    "enableImageGeneration": False,
    "returnImageBytes": False,
    "returnRawGrokInXaiRequest": False,
    "enableImageStreaming": False,
    "imageGenerationCount": 0,
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
        # `x-xai-request-id` is a per-request UUID the frontend always
        # sends — some endpoints (notably video gen) appear to require it
        # for dedup/idempotency, so add it to every call. Free to include.
        h = {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/json",
            "origin": GROK_BASE,
            "priority": "u=1, i",
            "referer": f"{GROK_BASE}{referer_path}",
            "user-agent": self.user_agent,
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-xai-request-id": str(uuid.uuid4()),
        }
        if self.x_statsig_id:
            h["x-statsig-id"] = self.x_statsig_id
        return h

    async def chat(
        self,
        prompt: str,
        project_id: str | None = None,
        model: str | None = None,
        log: Callable[[str], None] | None = None,
    ) -> dict[str, Any]:
        """Plain text chat against /conversations/new — no image / no
        upload — and return the streamed message reassembled.

        Captures the streaming pattern observed in the wild:
          - one or more `{result.response.token: "<chunk>"}` events
            with `messageTag = "final"` carry the user-visible text
          - the closing `{result.response.modelResponse: {...}}` event
            carries the full assembled message + metadata
          - `{result.response.isSoftStop: true}` is the soft EOF

        Returns: {message, conversation_id, response_id, model, latency_ms}.
        """
        body = dict(_CHAT_BODY)
        body["message"] = prompt
        body["workspaceIds"] = [project_id] if project_id else []
        if model:
            # Grok also accepts a top-level "modelOverride"; this is
            # passed through verbatim so callers can request grok-3,
            # grok-2-mini, etc., when the profile has access.
            body["modelOverride"] = model
        referer_path = f"/project/{project_id}" if project_id else "/"

        def _emit(msg: str) -> None:
            if log:
                log(msg)

        t0 = time.monotonic()
        chunks: list[str] = []
        conversation_id: str | None = None
        response_id: str | None = None
        model_used: str | None = None
        final_message: str | None = None
        soft_stopped = False

        # curl_cffi mimics Chrome's TLS fingerprint + HTTP/2 frame order,
        # which is what Cloudflare actually checks on grok.com — plain
        # httpx 403's reliably even with the right cookies. Falls back
        # to httpx if curl_cffi isn't installed (dev / offline runs).
        try:
            from curl_cffi.requests import AsyncSession  # type: ignore
            use_curl_cffi = True
        except ImportError:
            use_curl_cffi = False

        async def _process_stream_text_iter(text_iter):
            nonlocal final_message, model_used, conversation_id, response_id, soft_stopped
            buf = ""
            async for chunk in text_iter:
                buf += chunk if isinstance(chunk, str) else chunk.decode("utf-8", errors="replace")
                last_end = 0
                for obj_text, end in _iter_complete_json(buf):
                    last_end = end
                    try:
                        evt = json.loads(obj_text)
                    except json.JSONDecodeError:
                        continue
                    result = evt.get("result") or {}
                    conv = result.get("conversation") or {}
                    if conv.get("conversationId") and not conversation_id:
                        conversation_id = conv["conversationId"]
                    response = result.get("response") or {}
                    if not response_id and response.get("responseId"):
                        response_id = response["responseId"]
                    if (
                        response.get("token")
                        and response.get("messageTag") == "final"
                        and not response.get("isThinking")
                    ):
                        chunks.append(response["token"])
                    mr = response.get("modelResponse") or {}
                    if mr.get("message"):
                        final_message = mr["message"]
                        model_used = mr.get("model") or model_used
                    if response.get("isSoftStop"):
                        soft_stopped = True
                if last_end:
                    buf = buf[last_end:]
                if soft_stopped and final_message:
                    return

        if use_curl_cffi:
            async with AsyncSession(impersonate="chrome124") as client:  # type: ignore
                resp = await client.post(
                    GROK_BASE + ENDPOINT_NEW_CONVERSATION,
                    headers=self._headers(referer_path),
                    cookies=self.cookies,
                    json=body,
                    timeout=self.timeout,
                    stream=True,
                )
                if resp.status_code == 401:
                    raise GrokAPIError("cookie_expired", "401 from /conversations/new — session cookie invalid")
                if resp.status_code == 403:
                    raise GrokAPIError("provider_blocked", "403 — Cloudflare or statsig challenge", retryable=True)
                if resp.status_code == 429:
                    raise GrokAPIError("rate_limited", "429 — Grok rate limit", retryable=True)
                if resp.status_code >= 400:
                    body_bytes = await resp.acontent()
                    raise GrokAPIError(
                        "unknown_error",
                        f"{resp.status_code}: {body_bytes[:200].decode('utf-8', errors='replace')!r}",
                    )

                async def _iter():
                    async for chunk in resp.aiter_content():
                        yield chunk
                await _process_stream_text_iter(_iter())
        else:
            async with httpx.AsyncClient(
                timeout=self.timeout, cookies=self.cookies, follow_redirects=True,
                **_httpx_proxy_kwargs(),
            ) as client:
                async with client.stream(
                    "POST",
                    GROK_BASE + ENDPOINT_NEW_CONVERSATION,
                    headers=self._headers(referer_path),
                    json=body,
                ) as resp:
                    if resp.status_code == 401:
                        raise GrokAPIError("cookie_expired", "401 from /conversations/new — session cookie invalid")
                    if resp.status_code == 403:
                        raise GrokAPIError("provider_blocked", "403 — Cloudflare or statsig challenge", retryable=True)
                    if resp.status_code == 429:
                        raise GrokAPIError("rate_limited", "429 — Grok rate limit", retryable=True)
                    if resp.status_code >= 400:
                        snippet = (await resp.aread())[:200]
                        raise GrokAPIError(
                            "unknown_error",
                            f"{resp.status_code}: {snippet.decode('utf-8', errors='replace')!r}",
                        )
                    await _process_stream_text_iter(resp.aiter_text())

        latency_ms = int((time.monotonic() - t0) * 1000)
        message = final_message or "".join(chunks)
        _emit(f"chat done: {len(message)} chars in {latency_ms}ms")
        return {
            "message": message,
            "conversation_id": conversation_id,
            "response_id": response_id,
            "model": model_used or model or "grok-3",
            "latency_ms": latency_ms,
        }

    async def imagine(
        self,
        prompt: str,
        project_id: str | None = None,
        attachment: dict[str, str] | None = None,
        log: Callable[[str], None] | None = None,
    ) -> list[bytes]:
        """Submit `/imagine <prompt>` and return the bytes of every completed image.

        `attachment` (optional) — when set, makes this an image-to-image
        request. Pass the dict returned by `upload_file()` (must contain
        `fileMetadataId` + `fileUri`). The caller is responsible for
        having uploaded the user's reference image first.
        """
        results = await self.imagine_meta(
            prompt, project_id=project_id, attachment=attachment, log=log,
        )
        return [r["bytes"] for r in results]

    async def imagine_meta(
        self,
        prompt: str,
        project_id: str | None = None,
        attachment: dict[str, str] | None = None,
        log: Callable[[str], None] | None = None,
    ) -> list[dict[str, Any]]:
        """Like imagine() but also returns each image's relative URL and UUID.

        Video gen needs the image's `imageUuid` to use as parentPostId —
        re-uploading the bytes via /upload-file gives a *different* file
        ID that Grok rejects on the subsequent video request.

        Each entry: { bytes: bytes, image_url: str, image_uuid: str }.

        Image-to-image: pass `attachment={fileMetadataId, fileUri}` (the
        return of `upload_file()`). The asset URL gets inlined into the
        message (mirroring the videoize wire format) and the metadata id
        is attached to `imageAttachments` for Grok to bind to the
        Imagine pipeline.
        """
        body = dict(_IMAGE_BODY)
        # Clone the list slot the template carries so we don't mutate
        # the module-level dict on subsequent calls.
        body["imageAttachments"] = []
        body["fileAttachments"] = []
        clean_prompt = prompt.lstrip()
        if clean_prompt.startswith("/imagine"):
            clean_prompt = clean_prompt[len("/imagine"):].lstrip()
        if attachment:
            file_id = attachment.get("fileMetadataId")
            file_uri = attachment.get("fileUri")
            if not file_id or not file_uri:
                raise GrokAPIError(
                    "unknown_error",
                    f"imagine attachment missing ids: {attachment!r}",
                )
            asset_url = f"{ASSETS_BASE}/{file_uri.lstrip('/')}"
            # Two-space gap before prompt mirrors the captured videoize
            # wire format — Grok parses URL → prompt boundary on the gap.
            body["message"] = f"{asset_url}  /imagine {clean_prompt}"
            body["imageAttachments"] = [file_id]
            body["fileAttachments"] = [file_id]
            if log:
                log(f"imagine i2i: attachment={file_id[:12]}…")
        else:
            body["message"] = f"/imagine {clean_prompt}"
        body["workspaceIds"] = [project_id] if project_id else []
        referer_path = f"/project/{project_id}" if project_id else "/"

        # _submit_and_collect returns bytes for finished URLs; we also need
        # the URLs themselves, so run the lower-level collector that returns
        # URLs and download once at the end.
        urls = await self._stream_collect_urls(
            body=body,
            referer_path=referer_path,
            extract_asset=_extract_image_url,
            asset_label="image_chunk",
            log=log,
        )

        results: list[dict[str, Any]] = []
        async with httpx.AsyncClient(
            timeout=self.timeout, cookies=self.cookies, follow_redirects=True,
            **_httpx_proxy_kwargs(),
        ) as client:
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
                except httpx.HTTPError:
                    continue
                if r.status_code != 200:
                    continue
                # imageUrl format: users/<uid>/generated/<image_uuid>/image.jpg
                # Pull the UUID segment out — Grok uses it for parentPostId
                # in the subsequent video gen.
                parts = url.split("/")
                image_uuid = ""
                if "generated" in parts:
                    idx = parts.index("generated")
                    if idx + 1 < len(parts):
                        image_uuid = parts[idx + 1]
                results.append({
                    "bytes": r.content,
                    "image_url": url,
                    "image_uuid": image_uuid,
                })
        if not results:
            raise GrokAPIError(
                "unknown_error", "all imagine assets failed to download",
                retryable=True,
            )
        return results

    async def upload_file(
        self,
        content: bytes,
        filename: str,
        mime: str,
        log: Callable[[str], None] | None = None,
    ) -> dict[str, str]:
        """Upload an image to Grok and return its metadata dict.

        Response shape (captured 2026-05-14):
          {
            "fileMetadataId": "<uuid>",
            "fileMimeType": "image/jpeg",
            "fileName": "...",
            "fileUri": "users/<user_id>/<fileMetadataId>/content",
            ...
          }

        The `fileMetadataId` is what we plug into parentPostId and
        fileAttachments for the video request. The `fileUri` is prefixed
        with assets.grok.com to make the inline reference inside the
        message body.
        """
        encoded = base64.b64encode(content).decode("ascii")
        body = {
            "fileName": filename,
            "fileMimeType": mime,
            "fileSource": "IMAGINE_SELF_UPLOAD_FILE_SOURCE",
            "content": encoded,
        }
        async with httpx.AsyncClient(
            timeout=self.timeout, cookies=self.cookies, follow_redirects=True,
            **_httpx_proxy_kwargs(),
        ) as client:
            try:
                resp = await client.post(
                    GROK_BASE + ENDPOINT_UPLOAD_FILE,
                    headers=self._headers("/imagine"),
                    json=body,
                )
            except httpx.HTTPError as exc:
                raise GrokAPIError(
                    "network_error", f"upload-file HTTP error: {exc}", retryable=True
                ) from exc
            if resp.status_code == 401:
                raise GrokAPIError("cookie_expired", "401 from upload-file")
            if resp.status_code == 403:
                raise GrokAPIError(
                    "provider_blocked", "403 from upload-file", retryable=True
                )
            if resp.status_code >= 400:
                # Grok content moderation rejects ảnh nhạy cảm BEFORE the
                # prompt runs. Surface it as a terminal error so the user
                # gets the "đổi ảnh khác" message in the UI instead of
                # silently retrying for 30 minutes.
                body = resp.text or ""
                if "content-moderated" in body.lower() or "content is moderated" in body.lower():
                    raise GrokAPIError(
                        "content_moderated",
                        "Ảnh upload vi phạm Grok content policy — đổi ảnh khác.",
                    )
                raise GrokAPIError(
                    "unknown_error",
                    f"upload-file {resp.status_code}: {resp.text[:200]!r}",
                )
            try:
                data = resp.json()
            except json.JSONDecodeError as exc:
                raise GrokAPIError(
                    "unknown_error", f"upload-file bad JSON: {exc}"
                ) from exc
            if not data.get("fileMetadataId") or not data.get("fileUri"):
                raise GrokAPIError(
                    "unknown_error",
                    f"upload-file missing ids: {data!r}",
                )
            if log:
                log(f"uploaded {filename} → {data['fileMetadataId']}")
            return data

    async def videoize(
        self,
        prompt: str,
        *,
        file_metadata_id: str,
        file_uri: str,
        aspect_ratio: str = "3:2",
        resolution: str = "720p",
        duration: int = 10,
        mode: str = "custom",
        log: Callable[[str], None] | None = None,
    ) -> list[bytes]:
        """Submit an image-to-video request and return the bytes of the .mp4.

        `file_metadata_id` and `file_uri` come from `upload_file()`. The
        message field embeds the full asset URL of the uploaded image so
        Grok wires the image into the model's prompt; without it the
        backend rejects the request with `invalid-parent-post`.
        """
        # Strip any leading slash command — videoize uses --mode= suffix instead.
        clean_prompt = prompt.lstrip()
        if clean_prompt.startswith("/imagine"):
            clean_prompt = clean_prompt[len("/imagine"):].lstrip()
        asset_url = f"{ASSETS_BASE}/{file_uri.lstrip('/')}"
        # Two spaces between URL and prompt mirror the frontend's exact wire
        # format (captured 2026-05-14). Likely the frontend does
        # `f"{url}  {prompt} --mode={mode}"` and Grok parses that.
        message = f"{asset_url}  {clean_prompt} --mode={mode}"

        # Give Grok a moment to index the upload as a post-equivalent.
        await asyncio.sleep(2.0)

        # Multiple attempts: Grok's `parentPostId` is fussy. We don't know
        # exactly what it expects (the captured working request used the
        # fileMetadataId, but our identical-shape request 404s with
        # `invalid-parent-post`). Try a few body variants in order and use
        # the first that doesn't 404 on the lookup.
        attempts = [
            # (label, body_modification)
            ("with_parent", {
                "parentPostId": file_metadata_id,
                "fileAttachments": True,
            }),
            ("no_parent", {
                "fileAttachments": True,
            }),
            ("message_only", {}),
        ]

        last_err: GrokAPIError | None = None
        for label, variant in attempts:
            video_config: dict[str, Any] = {
                "aspectRatio": aspect_ratio,
                "videoLength": duration,
                "resolutionName": resolution,
            }
            if "parentPostId" in variant:
                video_config["parentPostId"] = variant["parentPostId"]

            body: dict[str, Any] = {
                "temporary": True,
                "modelName": "imagine-video-gen",
                "message": message,
                "enableSideBySide": True,
                "responseMetadata": {
                    "experiments": [],
                    "modelConfigOverride": {
                        "modelMap": {"videoGenModelConfig": video_config}
                    },
                },
            }
            if variant.get("fileAttachments"):
                body["fileAttachments"] = [file_metadata_id]

            if log:
                log(f"videoize attempt={label}")
            try:
                return await self._submit_and_collect(
                    body=body,
                    referer_path="/imagine",
                    extract_asset=_extract_video_url,
                    asset_label="video_chunk",
                    log=log,
                )
            except GrokAPIError as exc:
                # Retry on the rate_limited mapping (which is what we now
                # surface `invalid-parent-post` as) — that error can mean
                # either the upstream profile is genuinely out of quota OR
                # our body shape doesn't match what Grok wants. Trying the
                # other variants helps disambiguate without re-uploading.
                if exc.code == "rate_limited" and "quota exhausted" in exc.message:
                    last_err = exc
                    if log:
                        log(f"attempt {label} → invalid-parent-post; trying next")
                    continue
                raise
        # All attempts failed. Re-raise the last error so caller falls back.
        raise last_err or GrokAPIError(
            "unknown_error", "all videoize variants failed", retryable=True
        )

    async def _stream_collect_urls(
        self,
        *,
        body: dict[str, Any],
        referer_path: str,
        extract_asset: EventExtractor,
        asset_label: str,
        log: Callable[[str], None] | None,
    ) -> list[str]:
        """POST to /conversations/new and return only the asset URLs found.

        Same stream-parsing as `_submit_and_collect` but skips the asset
        download step so callers that need the URL itself (video gen needs
        the imageUuid) don't get the bytes back unnecessarily.
        """

        def _emit(msg: str) -> None:
            if log:
                log(msg)

        urls: list[str] = []
        soft_stopped = False

        async with httpx.AsyncClient(
            timeout=self.timeout, cookies=self.cookies, follow_redirects=True,
            **_httpx_proxy_kwargs(),
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
                        snippet_text = snippet.decode("utf-8", errors="replace")
                        if "invalid-parent-post" in snippet_text:
                            raise GrokAPIError(
                                "rate_limited",
                                "Grok video quota exhausted on this profile "
                                "— switch to another profile in the pool",
                                retryable=True,
                            )
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
            return urls

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
            timeout=self.timeout, cookies=self.cookies, follow_redirects=True,
            **_httpx_proxy_kwargs(),
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
                        snippet_text = snippet.decode("utf-8", errors="replace")
                        # `invalid-parent-post` is Grok's signal that the
                        # profile has hit its per-account video quota —
                        # the upload succeeded but the account can't start
                        # a new video gen. Surface as rate_limited so the
                        # ProfilesPage banner directs admin to switch.
                        if "invalid-parent-post" in snippet_text:
                            raise GrokAPIError(
                                "rate_limited",
                                "Grok video quota exhausted on this profile "
                                "— switch to another profile in the pool",
                                retryable=True,
                            )
                        raise GrokAPIError(
                            "unknown_error", f"{resp.status_code}: {snippet!r}"
                        )

                    buf = ""
                    event_count = 0
                    first_event_keys: list[str] = []
                    last_error_keys: list[str] = []
                    last_response_keys: list[str] = []
                    last_response_message: str = ""
                    async for chunk in resp.aiter_text():
                        buf += chunk
                        last_end = 0
                        for obj_text, end in _iter_complete_json(buf):
                            last_end = end
                            try:
                                evt = json.loads(obj_text)
                            except json.JSONDecodeError:
                                continue
                            event_count += 1
                            # Diagnostic: capture shape of first event + any
                            # error / response keys we encounter. Without this
                            # we can't tell if "stream ended without
                            # image_chunk" means empty stream, error event,
                            # text-only model reply, or extract-bug.
                            if event_count == 1:
                                first_event_keys = list(evt.keys())
                            err = evt.get("error")
                            if err:
                                last_error_keys = list(err.keys()) if isinstance(err, dict) else ["<non-dict>"]
                            resp_obj = (evt.get("result") or {}).get("response") or {}
                            if resp_obj:
                                last_response_keys = list(resp_obj.keys())
                                # Capture model's textual answer (truncated) —
                                # tells us if model refused / responded with
                                # chat text instead of an image.
                                token = resp_obj.get("token") or ""
                                if token and len(last_response_message) < 200:
                                    last_response_message += token
                            url = extract_asset(evt)
                            if url and url not in urls:
                                urls.append(url)
                                _emit(f"{asset_label} done: {url}")
                            if resp_obj.get("isSoftStop"):
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
                # Embed diagnostic context in the error message so we don't
                # need to add a separate _emit() chain. event_count==0 →
                # empty stream (CF cut, auth fail). event_count>0 + non-empty
                # response.token → model returned text instead of image (free
                # tier, moderation, prompt misunderstood).
                diag = (
                    f"events={event_count}"
                    f" first_keys={first_event_keys}"
                    f" resp_keys={last_response_keys}"
                    + (f" err_keys={last_error_keys}" if last_error_keys else "")
                    + (
                        f" msg={last_response_message[:120]!r}"
                        if last_response_message
                        else ""
                    )
                )
                raise GrokAPIError(
                    "unknown_error",
                    f"stream ended without a completed {asset_label} | {diag}",
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
