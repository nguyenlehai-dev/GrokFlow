"""Grok provider — routes Gateway calls into a customer-hosted
GrokService API (`/api/client/generate` + `/api/client/tasks/<id>/status`).

The upstream is NOT the GrokFlow admin API (`/api/jobs`) — it's the
customer's own GrokService that they've built on top of GrokFlow.
Contract (provided by customer):

  POST {base_url}/api/client/generate
  {
    "target": "image" | "video",
    "prompt": "...",
    "negative_prompt": "...",
    "count": 1,                          // max 10
    "ratio": "1:1" | "16:9" | ...,       // optional
    "quality": "standard" | "high",      // optional
    "reference_images": ["url1", ...],   // optional, max 8 (I2V/I2I)
    "duration": 5                        // video only, seconds
  }
  → { "task_id": "..." }

  GET {base_url}/api/client/tasks/{task_id}/status
  → { "status": "queued|running|success|failed", "result": [...], ... }

Pool key shape:
  - `api_key`       : GrokService API key
  - `metadata.url`  : base URL of the GrokService instance

Model naming:
  - "grok-image" / "grok-2-image"  → target=image
  - "grok-video" / "grok-2-video"  → target=video
  - anything containing "video"    → video; default = image
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from app.core.http_client import get_http
from . import ProviderAuthError, ProviderError, ProviderQuotaExhausted


POLL_INTERVAL = 2.0
POLL_MAX_SECONDS = 600  # 10 min — video gen can run 2-5 min

# Keys we consume from `extra` (pool metadata + caller passthrough) and
# should NOT also forward to the upstream as request fields.
_RESERVED_EXTRA_KEYS = {
    "url", "cookies", "firebase_id_token", "firebase_refresh_token",
    "user_agent", "model",
}

# Keys we DO want to forward into the upstream body (mapped 1:1).
_PASSTHROUGH_KEYS = {"negative_prompt", "count", "quality", "duration"}


class GrokProvider:
    async def execute(
        self,
        *,
        model: str,
        prompt: str | None,
        reference_image_urls: list[str],
        reference_video_urls: list[str],
        aspect_ratio: str | None,
        image_size: str | None,
        extra: dict[str, Any] | None,
        api_key: str,
        project_id: str | None,
    ) -> dict[str, Any]:
        if not prompt:
            raise ProviderError("Grok provider requires a non-empty prompt")

        extra = extra or {}
        base_url = (extra.get("url") or "").strip().rstrip("/")
        if not base_url:
            raise ProviderError(
                "Grok pool key thiếu `metadata.url` (GrokService base URL)"
            )
        if not api_key:
            raise ProviderAuthError("Grok pool key thiếu API key")

        target = "video" if "video" in (model or "").lower() else "image"

        body: dict[str, Any] = {
            "target": target,
            "prompt": prompt,
        }
        if aspect_ratio:
            body["ratio"] = aspect_ratio
        if reference_image_urls:
            # Upstream caps at 8 — clip silently to avoid 400s.
            body["reference_images"] = reference_image_urls[:8]
        # Caller-controlled passthrough (negative_prompt, count, quality,
        # duration). Anything else from `extra` that isn't pool metadata
        # is dropped — keeps the contract tight.
        for k in _PASSTHROUGH_KEYS:
            if k in extra and extra[k] is not None:
                body[k] = extra[k]

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        cli = get_http()

        # ── 1. Submit ─────────────────────────────────────────────
        submit_url = f"{base_url}/api/client/generate"
        try:
            r = await cli.post(submit_url, json=body, headers=headers, timeout=30.0)
        except httpx.HTTPError as exc:
            raise ProviderError(f"GrokService unreachable: {exc}") from exc

        if r.status_code in (401, 403):
            raise ProviderAuthError(_short_err(r))
        if r.status_code == 429:
            raise ProviderQuotaExhausted(_short_err(r))
        if r.status_code >= 400:
            raise ProviderError(_short_err(r))

        try:
            submitted = r.json()
        except Exception as exc:  # noqa: BLE001
            raise ProviderError(f"GrokService non-JSON response: {r.text[:200]}") from exc

        task_id = submitted.get("task_id") or submitted.get("id")
        if not task_id:
            raise ProviderError(
                f"GrokService trả về không có task_id: {str(submitted)[:300]}"
            )

        # ── 2. Poll ───────────────────────────────────────────────
        status_url = f"{base_url}/api/client/tasks/{task_id}/status"
        deadline = time.monotonic() + POLL_MAX_SECONDS
        last: dict[str, Any] = submitted
        while time.monotonic() < deadline:
            await asyncio.sleep(POLL_INTERVAL)
            try:
                pr = await cli.get(status_url, headers=headers, timeout=15.0)
            except httpx.HTTPError:
                continue   # transient — retry next tick
            if pr.status_code == 401:
                raise ProviderAuthError(_short_err(pr))
            if pr.status_code >= 400:
                raise ProviderError(_short_err(pr))
            try:
                last = pr.json()
            except Exception:
                continue
            status = (last.get("status") or "").lower()
            if status in ("success", "succeeded", "completed", "done"):
                break
            if status in ("failed", "error", "cancelled", "canceled"):
                raise ProviderError(
                    f"GrokService task {status}: {last.get('error') or last.get('message') or ''}"
                )
            # queued / running / processing — keep polling
        else:
            raise ProviderError(f"GrokService task timed out after {POLL_MAX_SECONDS}s")

        # ── 3. Extract result URLs ────────────────────────────────
        # Customer contract didn't pin the exact result shape — be liberal
        # in what we accept. Common shapes: result=[urls], output=[...],
        # files=[{url,...}], image_urls=[...], video_urls=[...].
        media_urls = _extract_media_urls(last)

        return {
            "model": model or f"grok-{target}",
            "text": None,
            "media_urls": media_urls,
            "tokens_input": None,
            "tokens_output": None,
            "raw": {
                "task_id": task_id,
                "target": target,
                "status": "success",
                "upstream_response": last,
            },
        }


def _extract_media_urls(payload: dict[str, Any]) -> list[str]:
    """Liberal URL extraction from GrokService status response.

    Walks common keys; accepts list of strings or list of dicts with
    `url`/`href`/`src`. Returns deduped, order-preserved list.
    """
    candidates: list[Any] = []
    for k in ("result", "results", "output", "outputs",
              "files", "image_urls", "video_urls", "urls"):
        v = payload.get(k)
        if isinstance(v, list):
            candidates.extend(v)
        elif isinstance(v, str):
            candidates.append(v)
    seen: set[str] = set()
    out: list[str] = []
    for item in candidates:
        url: str | None = None
        if isinstance(item, str):
            url = item
        elif isinstance(item, dict):
            url = item.get("url") or item.get("href") or item.get("src")
        if url and url.startswith(("http://", "https://", "data:")) and url not in seen:
            seen.add(url)
            out.append(url)
    return out


def _short_err(r: httpx.Response) -> str:
    try:
        body = r.json()
        detail = body.get("detail")
        if isinstance(detail, dict):
            return detail.get("message") or str(detail)[:300]
        if isinstance(detail, str):
            return detail
        return body.get("error") or body.get("message") or str(body)[:300]
    except Exception:  # noqa: BLE001
        pass
    return r.text[:500] if r.text else f"HTTP {r.status_code}"
