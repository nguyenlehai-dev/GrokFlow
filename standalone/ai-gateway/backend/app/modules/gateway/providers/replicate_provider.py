"""Replicate.com provider — model id is a `owner/name` or `owner/name:version`.

Replicate calls are inherently async: POST /predictions returns immediately
with status=starting, we then poll the prediction's URL until terminal.
For sync /execute we block up to ~3 minutes; for async /submit the gateway
runner will keep polling.

Auth: Authorization: Token <api_key>.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from app.core.http_client import get_http
from . import ProviderAuthError, ProviderError, ProviderQuotaExhausted

ROOT = "https://api.replicate.com/v1"
POLL_INTERVAL = 1.5
POLL_MAX_SECONDS = 180


class ReplicateProvider:
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
        if not model:
            raise ProviderError("Missing model — Replicate cần model id (vd: black-forest-labs/flux-pro)")

        input_payload: dict[str, Any] = {}
        if prompt:
            input_payload["prompt"] = prompt
        if reference_image_urls:
            # Replicate models accept either `image` (single) or `image_url`
            # / `images`. Send all variants — extras get ignored.
            input_payload["image"] = reference_image_urls[0]
            if len(reference_image_urls) > 1:
                input_payload["images"] = reference_image_urls
        if aspect_ratio:
            input_payload["aspect_ratio"] = aspect_ratio
        if image_size:
            input_payload["size"] = image_size
        if extra:
            input_payload.update(extra)

        # If model contains a ':version', use that as `version`; otherwise
        # use `model` (Replicate accepts both shapes since 2024).
        body: dict[str, Any] = {"input": input_payload}
        if ":" in model:
            body["version"] = model.split(":", 1)[1]
        else:
            body["model"] = model

        headers = {
            "Authorization": f"Token {api_key}",
            "Content-Type": "application/json",
        }

        cli = get_http()
        r = await cli.post(
            f"{ROOT}/predictions", json=body, headers=headers,
            timeout=float(POLL_MAX_SECONDS),
        )
        if r.status_code in (401, 403):
            raise ProviderAuthError(_short_err(r))
        if r.status_code == 429:
            raise ProviderQuotaExhausted(_short_err(r))
        if r.status_code >= 400:
            raise ProviderError(_short_err(r))
        data = r.json()

        # Poll until terminal status or timeout.
        poll_url = (data.get("urls") or {}).get("get")
        started = time.monotonic()
        while data.get("status") in {"starting", "processing"} and poll_url:
            if time.monotonic() - started > POLL_MAX_SECONDS:
                raise ProviderError("Replicate prediction timed out (>180s)")
            await asyncio.sleep(POLL_INTERVAL)
            pr = await cli.get(poll_url, headers=headers, timeout=float(POLL_MAX_SECONDS))
            if pr.status_code >= 400:
                raise ProviderError(_short_err(pr))
            data = pr.json()

        if data.get("status") == "failed":
            raise ProviderError(data.get("error") or "Replicate prediction failed")

        return _normalize(data, model=model)


def _short_err(r: httpx.Response) -> str:
    try:
        body = r.json()
        detail = body.get("detail") or body.get("title") or body.get("error")
        if isinstance(detail, str):
            return detail
    except Exception:  # noqa: BLE001
        pass
    return r.text[:500] if r.text else f"HTTP {r.status_code}"


def _normalize(data: dict[str, Any], *, model: str) -> dict[str, Any]:
    output = data.get("output")
    media_urls: list[str] = []
    text_chunks: list[str] = []

    if isinstance(output, str):
        if output.startswith("http://") or output.startswith("https://") or output.startswith("data:"):
            media_urls.append(output)
        else:
            text_chunks.append(output)
    elif isinstance(output, list):
        for item in output:
            if isinstance(item, str):
                if item.startswith("http://") or item.startswith("https://") or item.startswith("data:"):
                    media_urls.append(item)
                else:
                    text_chunks.append(item)
    elif isinstance(output, dict):
        # Some models return {"image": "https://..."} or similar
        for v in output.values():
            if isinstance(v, str) and (v.startswith("http") or v.startswith("data:")):
                media_urls.append(v)

    return {
        "model": model,
        "text": "\n".join(text_chunks) if text_chunks else None,
        "media_urls": media_urls,
        "tokens_input": None,  # Replicate bills by prediction count, not tokens
        "tokens_output": None,
        "raw": data,
    }
