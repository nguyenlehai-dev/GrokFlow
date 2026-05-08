"""Outbound webhook delivery to user-configured URL on job complete/failed.

Signature: HMAC-SHA256 of body, base64-encoded, in header `X-Grokflow-Signature`.
Body: JSON event payload. User verifies signature with their `webhook_secret`.

Retry: 3 attempts with exponential backoff (1s, 4s, 16s). After that, give up
and log a warning. We don't have a separate dead-letter queue yet (Phase 4+).
"""

import asyncio
import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any

import httpx

from app.models import Job, User


def sign(secret: str, body: bytes) -> str:
    digest = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def event_payload(job: Job, event: str) -> dict[str, Any]:
    return {
        "event": event,  # job.success | job.failed | job.cancelled
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "job": {
            "id": str(job.id),
            "provider": job.provider,
            "job_type": job.job_type,
            "status": job.status,
            "result_url": job.result_url,
            "error_message": job.error_message,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        },
    }


async def deliver(user: User, job: Job, event: str) -> bool:
    if not user.webhook_url:
        return False
    body_dict = event_payload(job, event)
    body = json.dumps(body_dict, separators=(",", ":")).encode()
    headers = {"Content-Type": "application/json", "X-Grokflow-Event": event}
    if user.webhook_secret:
        headers["X-Grokflow-Signature"] = sign(user.webhook_secret, body)

    backoff = 1.0
    async with httpx.AsyncClient(timeout=10) as client:
        for attempt in range(3):
            try:
                resp = await client.post(user.webhook_url, content=body, headers=headers)
                if 200 <= resp.status_code < 300:
                    return True
                if resp.status_code in (400, 401, 403, 404, 410):
                    return False  # client error, don't retry
            except (httpx.RequestError, httpx.TimeoutException):
                pass
            if attempt < 2:
                await asyncio.sleep(backoff)
                backoff *= 4
    return False
