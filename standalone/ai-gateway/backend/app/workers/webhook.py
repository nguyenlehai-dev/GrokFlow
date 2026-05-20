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
import ipaddress
import json
import logging
import socket
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.http_client import get_http
from app.models import Job, User

log = logging.getLogger(__name__)


def _is_public_webhook_target(url: str) -> bool:
    """Reject webhook URLs pointing at private/internal addresses (SSRF guard).

    Allowed:  https://api.customer.example/...   (public IP / public DNS)
    Blocked:  http://localhost, http://127.x, http://10.x, http://192.168.x,
              http://172.16-31.x, http://169.254.169.254 (AWS metadata),
              http://[::1], any hostname resolving to those ranges, plain
              http://, file://, ftp://, etc.

    Returns True only if it's safe to POST to. Resolves DNS to catch a
    customer URL whose A record points back at a private range.
    """
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    # 1. Scheme — only HTTPS in prod. http allowed only if explicit
    #    127.0.0.1 dev override (we still block by IP below).
    if parsed.scheme not in ("https", "http"):
        return False
    if parsed.scheme == "http":
        return False  # tighten: require TLS for any real webhook
    host = parsed.hostname or ""
    if not host:
        return False
    # 2. Resolve to IP(s) so a public hostname pointing at 10.x is caught.
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            continue
        # Reject any IP that isn't globally routable.
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return False
    return True


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
    # SSRF guard — never POST to user-supplied URLs that resolve to
    # internal IPs (cloud metadata endpoints, intra-cluster services, …).
    if not _is_public_webhook_target(user.webhook_url):
        log.warning(
            "webhook target rejected as non-public: user=%s url=%s",
            user.id, user.webhook_url,
        )
        return False
    body_dict = event_payload(job, event)
    body = json.dumps(body_dict, separators=(",", ":")).encode()
    headers = {"Content-Type": "application/json", "X-Grokflow-Event": event}
    if user.webhook_secret:
        headers["X-Grokflow-Signature"] = sign(user.webhook_secret, body)

    backoff = 1.0
    client = get_http()
    for attempt in range(3):
        try:
            resp = await client.post(
                user.webhook_url, content=body, headers=headers, timeout=10.0,
            )
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
