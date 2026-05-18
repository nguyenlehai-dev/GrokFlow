"""Grok provider — routes Gateway calls into a GrokFlow instance's
/api/jobs endpoint (which then drives Grok via browser automation).

Why route through GrokFlow rather than calling Grok directly?
Grok (xAI) doesn't have a clean public image/video generation API. To
generate Grok content programmatically we drive grok.com in a managed
Chromium (the VNC profile pipeline). The Gateway provider here lets
client apps use a uniform OpenAI/Replicate-style interface and have
their request routed to a back-end GrokFlow worker pool.

Pool key shape:
  - `api_key` : a GrokFlow API key (uxpm_live_*) of an account with
                Grok profiles attached
  - `metadata.url` : base URL of the GrokFlow instance, e.g.
                `https://flowgrok.plxeditor.com`

Model naming convention:
  - "grok-image" / "grok-2-image" → job_type=image
  - "grok-video" / "grok-2-video" → job_type=video
  - anything else with "video" in the name → video; default = image

Lifecycle (mirrors Replicate provider):
  1. POST /api/jobs                  — submit, returns {id, status}
  2. poll GET /api/jobs/{id}         — until success / failed
  3. GET /api/jobs/{id}/files        — fetch result URLs
  4. return normalized dict
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from app.core.http_client import get_http
from . import ProviderAuthError, ProviderError, ProviderQuotaExhausted


POLL_INTERVAL = 2.0
POLL_MAX_SECONDS = 600  # 10 min — Grok video gen can run 2-5 min


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
                "Grok pool key thiếu `metadata.url` (GrokFlow instance URL, vd: https://flowgrok.plxeditor.com)"
            )
        if not api_key:
            raise ProviderAuthError(
                "Grok pool key thiếu API key (uxpm_live_* của tài khoản GrokFlow)"
            )

        # Map model → job_type. Default is image; anything containing
        # 'video' is treated as a video job.
        job_type = "video" if "video" in (model or "").lower() else "image"

        body: dict[str, Any] = {
            "provider": "grok",
            "job_type": job_type,
            "prompt": prompt,
        }
        if aspect_ratio:
            body["aspect_ratio"] = aspect_ratio
        if image_size:
            body["image_size"] = image_size
        if reference_image_urls:
            body["reference_image_urls"] = reference_image_urls
        if reference_video_urls:
            body["reference_video_urls"] = reference_video_urls
        # Pass-through for anything else the manifest declared (negative
        # prompt, seed, etc.) — strip keys the proxy already consumed.
        for k, v in extra.items():
            if k in ("url", "cookies", "firebase_id_token", "firebase_refresh_token", "user_agent"):
                continue
            body.setdefault(k, v)

        headers = {
            "X-API-Key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        cli = get_http()

        # ── 1. Submit ─────────────────────────────────────────────
        try:
            r = await cli.post(
                f"{base_url}/api/jobs", json=body, headers=headers,
                timeout=30.0,
            )
        except httpx.HTTPError as exc:
            raise ProviderError(f"GrokFlow unreachable: {exc}") from exc

        if r.status_code in (401, 403):
            raise ProviderAuthError(_short_err(r))
        if r.status_code == 429:
            raise ProviderQuotaExhausted(_short_err(r))
        if r.status_code >= 400:
            raise ProviderError(_short_err(r))
        submitted = r.json()
        job_id = submitted.get("id")
        if not job_id:
            raise ProviderError(f"GrokFlow returned no job id: {str(submitted)[:200]}")

        # ── 2. Poll ───────────────────────────────────────────────
        deadline = time.monotonic() + POLL_MAX_SECONDS
        last: dict[str, Any] = submitted
        while time.monotonic() < deadline:
            await asyncio.sleep(POLL_INTERVAL)
            try:
                pr = await cli.get(
                    f"{base_url}/api/jobs/{job_id}", headers=headers,
                    timeout=15.0,
                )
            except httpx.HTTPError:
                continue  # transient — retry next tick
            if pr.status_code == 401:
                raise ProviderAuthError(_short_err(pr))
            if pr.status_code >= 400:
                raise ProviderError(_short_err(pr))
            last = pr.json()
            status = (last.get("status") or "").lower()
            if status == "success":
                break
            if status in ("failed", "cancelled"):
                raise ProviderError(
                    f"GrokFlow job {status}: {last.get('error_message') or ''}"
                )
            # `queued`, `running`, `processing_provider`, `uploading_result` — keep polling
        else:
            raise ProviderError(f"GrokFlow job timed out after {POLL_MAX_SECONDS}s")

        # ── 3. Fetch result files ─────────────────────────────────
        try:
            fr = await cli.get(
                f"{base_url}/api/jobs/{job_id}/files", headers=headers,
                timeout=15.0,
            )
        except httpx.HTTPError as exc:
            raise ProviderError(f"GrokFlow files fetch failed: {exc}") from exc
        if fr.status_code >= 400:
            raise ProviderError(_short_err(fr))
        files = fr.json() or []
        media_urls = [f.get("url") for f in files if f.get("url")]

        # ── 4. Return normalized ──────────────────────────────────
        return {
            "model": model or f"grok-{job_type}",
            "text": None,
            "media_urls": media_urls,
            "tokens_input": None,
            "tokens_output": None,
            "raw": {
                "job_id": job_id,
                "job_type": job_type,
                "status": "success",
                "grokflow_response": last,
                "files": files,
            },
        }


def _short_err(r: httpx.Response) -> str:
    try:
        body = r.json()
        detail = body.get("detail")
        if isinstance(detail, dict):
            return detail.get("message") or str(detail)[:300]
        if isinstance(detail, str):
            return detail
        return body.get("error") or str(body)[:300]
    except Exception:  # noqa: BLE001
        pass
    return r.text[:500] if r.text else f"HTTP {r.status_code}"
