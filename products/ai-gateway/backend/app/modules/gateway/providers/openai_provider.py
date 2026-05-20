"""OpenAI provider via REST.

Routes to /v1/images/generations for image-class models (dall-e-3,
dall-e-2, gpt-image-1) and to /v1/chat/completions for text models.
Reference image URLs are inlined as data URLs in the chat case (vision
models accept `image_url` content parts). Image-gen endpoint doesn't
support reference inputs natively — those get ignored with a note.
"""
from __future__ import annotations

import base64
import mimetypes
from typing import Any

import httpx

from app.core.http_client import get_http
from . import ProviderAuthError, ProviderError, ProviderQuotaExhausted

ROOT = "https://api.openai.com/v1"


def _is_image_model(model: str) -> bool:
    m = model.lower()
    return m.startswith("dall-e") or m.startswith("gpt-image") or "image" in m


async def _download_data_url(cli: httpx.AsyncClient, url: str) -> str:
    r = await cli.get(url, timeout=30)
    r.raise_for_status()
    ct = r.headers.get("content-type") or mimetypes.guess_type(url)[0] or "image/png"
    b64 = base64.b64encode(r.content).decode("ascii")
    return f"data:{ct.split(';')[0]};base64,{b64}"


class OpenAIProvider:
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
            raise ProviderError("Missing model — OpenAI cần model id (vd: gpt-image-1)")
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        if project_id:
            headers["OpenAI-Project"] = project_id

        cli = get_http()
        timeout = 180.0
        if _is_image_model(model):
            body = {"model": model, "prompt": prompt or "", "n": 1}
            # Image size shorthand: OpenAI accepts 1024x1024, 1792x1024, 1024x1792
            if image_size:
                body["size"] = _map_size(image_size, aspect_ratio)
            if extra:
                body.update(extra)
            r = await cli.post(f"{ROOT}/images/generations", json=body, headers=headers, timeout=timeout)
        else:
            content: list[dict[str, Any]] = []
            if prompt:
                content.append({"type": "text", "text": prompt})
            for u in reference_image_urls:
                if not u.strip():
                    continue
                data_url = await _download_data_url(cli, u.strip())
                content.append({"type": "image_url", "image_url": {"url": data_url}})
            body = {"model": model, "messages": [{"role": "user", "content": content}]}
            if extra:
                body.update(extra)
            r = await cli.post(f"{ROOT}/chat/completions", json=body, headers=headers, timeout=timeout)

        if r.status_code in (401, 403):
            raise ProviderAuthError(_short_err(r))
        if r.status_code == 429:
            raise ProviderQuotaExhausted(_short_err(r))
        if r.status_code >= 400:
            raise ProviderError(_short_err(r))

        data = r.json()
        return _normalize(data, model=model, is_image=_is_image_model(model))


def _short_err(r: httpx.Response) -> str:
    try:
        err = r.json().get("error", {})
        return err.get("message") or f"HTTP {r.status_code}"
    except Exception:  # noqa: BLE001
        return r.text[:500] if r.text else f"HTTP {r.status_code}"


def _map_size(image_size: str, aspect_ratio: str | None) -> str:
    """Translate the gateway's image_size shorthand (1K, 2K, 4K) and
    aspect_ratio into one of OpenAI's accepted sizes."""
    ar = (aspect_ratio or "1:1").lower()
    table_1k = {"1:1": "1024x1024", "16:9": "1792x1024", "9:16": "1024x1792"}
    table_2k = {"1:1": "2048x2048", "16:9": "2048x1152", "9:16": "1152x2048"}
    if image_size.lower() == "2k":
        return table_2k.get(ar, "2048x2048")
    return table_1k.get(ar, "1024x1024")


def _normalize(data: dict[str, Any], *, model: str, is_image: bool) -> dict[str, Any]:
    media_urls: list[str] = []
    text_chunks: list[str] = []

    if is_image:
        for item in data.get("data", []) or []:
            if "url" in item and item["url"]:
                media_urls.append(item["url"])
            elif "b64_json" in item and item["b64_json"]:
                media_urls.append(f"data:image/png;base64,{item['b64_json']}")
    else:
        for ch in data.get("choices", []) or []:
            msg = ch.get("message", {})
            content = msg.get("content")
            if isinstance(content, str):
                text_chunks.append(content)
            elif isinstance(content, list):
                for part in content:
                    if part.get("type") == "text" and part.get("text"):
                        text_chunks.append(part["text"])

    usage = data.get("usage") or {}
    return {
        "model": model,
        "text": "\n".join(text_chunks) if text_chunks else None,
        "media_urls": media_urls,
        "tokens_input": usage.get("prompt_tokens") or usage.get("input_tokens"),
        "tokens_output": usage.get("completion_tokens") or usage.get("output_tokens"),
        "raw": data,
    }
