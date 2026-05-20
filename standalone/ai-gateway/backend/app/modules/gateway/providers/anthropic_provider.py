"""Anthropic Claude via REST /v1/messages.

Vision is supported: reference image URLs get downloaded + base64-inlined
as content blocks with type="image". Anthropic doesn't do image generation
natively, so image-gen models route to a normalized error (the gateway
should send image jobs to a different pool/vendor).

Auth: x-api-key header + anthropic-version: 2023-06-01.
"""
from __future__ import annotations

import base64
import mimetypes
from typing import Any

import httpx

from app.core.http_client import get_http
from . import ProviderAuthError, ProviderError, ProviderQuotaExhausted

ROOT = "https://api.anthropic.com/v1"
ANTHROPIC_VERSION = "2023-06-01"


async def _fetch_image_block(cli: httpx.AsyncClient, url: str) -> dict[str, Any]:
    r = await cli.get(url, timeout=30)
    r.raise_for_status()
    media = r.headers.get("content-type") or mimetypes.guess_type(url)[0] or "image/png"
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": media.split(";")[0],
            "data": base64.b64encode(r.content).decode("ascii"),
        },
    }


class AnthropicProvider:
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
            raise ProviderError("Missing model — Anthropic cần model id (vd: claude-3-5-sonnet-latest)")
        if reference_video_urls:
            raise ProviderError("Anthropic không hỗ trợ video input")

        content: list[dict[str, Any]] = []
        cli = get_http()
        for u in reference_image_urls:
            if u.strip():
                content.append(await _fetch_image_block(cli, u.strip()))
        if prompt:
            content.append({"type": "text", "text": prompt})

        body: dict[str, Any] = {
            "model": model,
            "max_tokens": (extra or {}).get("max_tokens", 4096),
            "messages": [{"role": "user", "content": content or [{"type": "text", "text": ""}]}],
        }
        if extra:
            # Merge extra params (temperature, system, etc.) onto the body.
            for k, v in extra.items():
                if k != "max_tokens":
                    body[k] = v

        r = await cli.post(
            f"{ROOT}/messages",
            json=body,
            timeout=180.0,
            headers={
                "x-api-key": api_key,
                "anthropic-version": ANTHROPIC_VERSION,
                "content-type": "application/json",
            },
        )

        if r.status_code in (401, 403):
            raise ProviderAuthError(_short_err(r))
        if r.status_code == 429:
            raise ProviderQuotaExhausted(_short_err(r))
        if r.status_code >= 400:
            raise ProviderError(_short_err(r))
        data = r.json()
        return _normalize(data, model=model)


def _short_err(r: httpx.Response) -> str:
    try:
        err = r.json().get("error", {})
        return err.get("message") or f"HTTP {r.status_code}"
    except Exception:  # noqa: BLE001
        return r.text[:500] if r.text else f"HTTP {r.status_code}"


def _normalize(data: dict[str, Any], *, model: str) -> dict[str, Any]:
    text_chunks: list[str] = []
    for block in data.get("content", []) or []:
        if block.get("type") == "text" and block.get("text"):
            text_chunks.append(block["text"])
    usage = data.get("usage") or {}
    return {
        "model": model,
        "text": "\n".join(text_chunks) if text_chunks else None,
        "media_urls": [],
        "tokens_input": usage.get("input_tokens"),
        "tokens_output": usage.get("output_tokens"),
        "raw": data,
    }
