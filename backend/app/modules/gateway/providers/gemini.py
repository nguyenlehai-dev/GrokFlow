"""Google Gemini provider using the REST `generateContent` endpoint.

Image-capable models (gemini-2.5-flash-image-preview, gemini-3-pro-image,
nano-banana variants) honour `responseModalities: ["IMAGE"]` in
generationConfig — the returned candidates contain inlineData parts with
base64-encoded PNGs.

Text models drop the modality hint and return text parts.

Reference image URLs are downloaded and inlined as base64 so the same
SDK shape handles both text-to-image and image-to-image / reference-based.
"""
from __future__ import annotations

import base64
import mimetypes
from typing import Any

import httpx

from . import ProviderAuthError, ProviderError, ProviderQuotaExhausted

API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"


def _looks_like_image_model(model: str) -> bool:
    m = model.lower()
    return "image" in m or "nano-banana" in m or "imagen" in m


async def _fetch_inline(cli: httpx.AsyncClient, url: str) -> dict[str, Any]:
    """Download a reference URL and return a Gemini `inlineData` part."""
    r = await cli.get(url, timeout=30)
    r.raise_for_status()
    ct = r.headers.get("content-type") or mimetypes.guess_type(url)[0] or "application/octet-stream"
    return {
        "inlineData": {
            "mimeType": ct.split(";")[0].strip(),
            "data": base64.b64encode(r.content).decode("ascii"),
        }
    }


class GeminiProvider:
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
            raise ProviderError("Missing model — Gemini cần model id (vd: gemini-2.5-flash-image-preview)")

        parts: list[dict[str, Any]] = []
        if prompt:
            parts.append({"text": prompt})

        async with httpx.AsyncClient(timeout=180) as cli:
            for u in reference_image_urls:
                if u.strip():
                    parts.append(await _fetch_inline(cli, u.strip()))
            for u in reference_video_urls:
                if u.strip():
                    parts.append(await _fetch_inline(cli, u.strip()))

            body: dict[str, Any] = {"contents": [{"parts": parts}]}
            gen_cfg: dict[str, Any] = {}

            if _looks_like_image_model(model):
                gen_cfg["responseModalities"] = ["IMAGE"]
                if aspect_ratio:
                    gen_cfg["aspectRatio"] = aspect_ratio
                if image_size:
                    # Gemini's image-preview spec uses "imageSize" (eg "1K", "2K")
                    gen_cfg["imageSize"] = image_size

            if extra:
                body.update(extra)
            if gen_cfg:
                body["generationConfig"] = gen_cfg

            url = f"{API_ROOT}/{model}:generateContent?key={api_key}"
            r = await cli.post(url, json=body)

            if r.status_code == 401 or r.status_code == 403:
                raise ProviderAuthError(_short_err(r))
            if r.status_code == 429:
                raise ProviderQuotaExhausted(_short_err(r))
            if r.status_code >= 400:
                raise ProviderError(_short_err(r))

            data = r.json()

        return _normalize_response(data, model=model)


def _short_err(r: httpx.Response) -> str:
    try:
        err = r.json().get("error", {})
        return err.get("message") or f"HTTP {r.status_code}"
    except Exception:  # noqa: BLE001
        return r.text[:500] if r.text else f"HTTP {r.status_code}"


def _normalize_response(data: dict[str, Any], *, model: str) -> dict[str, Any]:
    """Pull the useful bits out of Gemini's response so the FE doesn't need
    to know the SDK shape. We return text content (joined) + a list of
    output image data URLs.
    """
    text_chunks: list[str] = []
    image_data_urls: list[str] = []

    for cand in data.get("candidates", []) or []:
        for p in cand.get("content", {}).get("parts", []) or []:
            if "text" in p and p["text"]:
                text_chunks.append(p["text"])
            inline = p.get("inlineData") or p.get("inline_data")
            if inline:
                mime = inline.get("mimeType") or inline.get("mime_type") or "image/png"
                b64 = inline.get("data") or ""
                if b64:
                    image_data_urls.append(f"data:{mime};base64,{b64}")

    return {
        "model": model,
        "text": "\n".join(text_chunks) if text_chunks else None,
        "media_urls": image_data_urls,
        "raw": data,
    }
