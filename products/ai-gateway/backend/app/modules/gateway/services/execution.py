"""Gateway execution core — pool resolution, key picking, provider invocation.

The /execute and /submit endpoints in `routers/execute.py` are thin
wrappers that:
  1. Create a 'pending' GwRequest row
  2. Call `do_execute()` (this file) to run the provider + update the row
  3. Return the (possibly updated) row to the client

Quota enforcement (`enforce_gateway_key_quota`) is also here because both
endpoints share the same per-minute + daily-quota check.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select

from app.core.exceptions import AppError, InvalidPayload, NotFound
from app.models import (
    GwApiFunction, GwGatewayKey, GwPool, GwPoolApiKey, GwRequest, GwVendor,
)
from app.modules.gateway import schemas as s
from app.modules.gateway.auth import GatewayCaller
from app.modules.gateway.providers import (
    ProviderAuthError, ProviderError, ProviderQuotaExhausted, get_provider,
)


QUOTA_COOLDOWN_DEFAULT = 300  # fallback if a pool has no cooldown_seconds (legacy rows)


class GatewayRateLimitExceeded(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(429, "rate_limited", message)


class GatewayQuotaExceeded(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(429, "daily_quota_exceeded", message)


async def enforce_gateway_key_quota(
    db, caller: GatewayCaller,
) -> GwGatewayKey | None:
    """Throttle the calling gateway key.

    Two checks, in order: (1) requests in the last 60s vs rate_limit_per_minute,
    (2) used_today vs daily_quota (0 = unlimited). Admin callers skip both.
    Returns the GwGatewayKey for the caller (so caller can update used_today
    after a successful call), or None when caller is admin.
    """
    if caller.kind != "gateway_key" or not caller.gateway_key_id:
        return None

    gk = await db.get(GwGatewayKey, caller.gateway_key_id)
    if not gk:
        return None

    # Daily quota
    if gk.daily_quota and gk.used_today >= gk.daily_quota:
        raise GatewayQuotaExceeded(
            f"Đã dùng hết daily quota ({gk.daily_quota}). Reset vào UTC midnight."
        )

    # Per-minute rate limit
    one_min_ago = datetime.now(timezone.utc) - timedelta(minutes=1)
    recent = (await db.execute(
        select(func.count()).select_from(GwRequest)
        .where(
            GwRequest.gateway_key_id == gk.id,
            GwRequest.created_at >= one_min_ago,
        )
    )).scalar() or 0
    if gk.rate_limit_per_minute and recent >= gk.rate_limit_per_minute:
        raise GatewayRateLimitExceeded(
            f"Rate limit {gk.rate_limit_per_minute}/phút bị vượt — chờ vài giây."
        )

    return gk


async def resolve_pool(
    db, function_code: str, model: str | None,
) -> tuple[GwApiFunction, GwPool, GwVendor, list[GwPoolApiKey]]:
    """Look up function, pool, vendor, and pickable candidate keys.

    A key is "pickable" when status='active' AND
    (cooldown_until IS NULL OR cooldown_until < now).
    """
    fn = (await db.execute(
        select(GwApiFunction).where(GwApiFunction.code == function_code)
    )).scalar_one_or_none()
    if not fn:
        raise NotFound("function")

    pool_q = select(GwPool).where(
        GwPool.function_id == fn.id, GwPool.status == "active",
    )
    if model:
        pool_q = pool_q.where(GwPool.model == model)
    pool = (await db.execute(pool_q.limit(1))).scalar_one_or_none()
    if not pool:
        raise InvalidPayload(
            f"Chưa có pool active nào cho function '{function_code}'"
            + (f" + model '{model}'" if model else "")
        )

    vendor = await db.get(GwVendor, pool.vendor_id)
    if not vendor:
        raise InvalidPayload("Vendor không tồn tại")

    now = datetime.now(timezone.utc)
    candidates: list[GwPoolApiKey] = list((await db.execute(
        select(GwPoolApiKey)
        .where(
            GwPoolApiKey.pool_id == pool.id,
            GwPoolApiKey.status == "active",
            or_(
                GwPoolApiKey.cooldown_until.is_(None),
                GwPoolApiKey.cooldown_until < now,
            ),
        )
        .order_by(GwPoolApiKey.priority.desc(), GwPoolApiKey.used_count)
    )).scalars().all())

    if not candidates:
        raise InvalidPayload(
            f"Pool '{pool.name}' không có API key khả dụng (hết cooldown / inactive)"
        )

    return fn, pool, vendor, candidates


async def do_execute(
    db, gw_id: str, pool: GwPool, vendor: GwVendor,
    candidates: list[GwPoolApiKey], function_code: str,
    payload: s.ExecuteRequest, gateway_key_id: uuid.UUID | None,
) -> GwRequest:
    """Shared core: run through candidate keys, persist GwRequest row.

    Pre-condition: caller has inserted a 'pending' GwRequest with `gw_id`.
    This function updates it in place + commits.
    """
    provider = get_provider(vendor.code)
    if provider is None:
        req = (await db.execute(
            select(GwRequest).where(GwRequest.gw_id == gw_id)
        )).scalar_one()
        req.status = "failed"
        req.error_message = f"Vendor '{vendor.code}' chưa có provider implementation"
        await db.commit()
        return req

    started = time.monotonic()
    last_err: str | None = None
    used_key: GwPoolApiKey | None = None
    normalized: dict | None = None
    final_status = "failed"
    model = payload.model or pool.model or ""

    for key in candidates:
        # Merge the pool key's admin-configured metadata (url, cookies,
        # provider-specific options like firebase tokens) into the extra
        # dict, with pool metadata taking precedence over caller payload
        # so a client can't override infra config like upstream URL.
        # Providers that don't need metadata (gemini/openai/anthropic)
        # just ignore the extra keys; new providers (grok) read from it.
        combined_extra = {**(payload.raw or {}), **(key.metadata or {})}
        try:
            normalized = await provider.execute(
                model=model,
                prompt=payload.prompt,
                reference_image_urls=payload.reference_image_urls,
                reference_video_urls=payload.reference_video_urls,
                aspect_ratio=payload.aspect_ratio,
                image_size=payload.image_size,
                extra=combined_extra,
                api_key=key.api_key,
                project_id=key.project_id,
            )
            used_key = key
            final_status = "succeeded"
            break
        except ProviderQuotaExhausted as e:
            last_err = f"[quota] {e}"
            cd_secs = pool.cooldown_seconds or QUOTA_COOLDOWN_DEFAULT
            key.cooldown_until = datetime.now(timezone.utc) + timedelta(seconds=cd_secs)
            key.last_used_at = datetime.now(timezone.utc)
            await db.flush()
            continue
        except ProviderAuthError as e:
            last_err = f"[auth] {e}"
            key.status = "inactive"
            await db.flush()
            continue
        except ProviderError as e:
            last_err = str(e)
            used_key = key
            break
        except Exception as e:  # noqa: BLE001 — provider should subclass ProviderError, but be safe
            last_err = f"unexpected: {e}"
            used_key = key
            break

    latency = int((time.monotonic() - started) * 1000)
    if used_key and final_status == "succeeded":
        used_key.used_count += 1
        used_key.last_used_at = datetime.now(timezone.utc)

    # Cost / token usage — pulled out of the normalized provider response
    # and combined with pool pricing (cents per million tokens).
    tokens_in = (normalized or {}).get("tokens_input")
    tokens_out = (normalized or {}).get("tokens_output")
    cost_cents: int | None = None
    if final_status == "succeeded" and (tokens_in or tokens_out):
        ci = pool.cost_per_million_input_cents or 0
        co = pool.cost_per_million_output_cents or 0
        if ci or co:
            cost_cents = int(
                ((tokens_in or 0) * ci + (tokens_out or 0) * co) / 1_000_000
            )

    req = (await db.execute(
        select(GwRequest).where(GwRequest.gw_id == gw_id)
    )).scalar_one()
    req.status = final_status
    req.pool_key_id = used_key.id if used_key else None
    req.model = model
    req.response_body = normalized
    req.error_message = last_err
    req.latency_ms = latency
    req.tokens_input = tokens_in
    req.tokens_output = tokens_out
    req.cost_cents = cost_cents

    # Bump gateway key's used_today after success (cheap concurrent-safe-enough
    # increment — slight overcount in races is acceptable for billing).
    if final_status == "succeeded" and req.gateway_key_id:
        gk = await db.get(GwGatewayKey, req.gateway_key_id)
        if gk:
            gk.used_today += 1

    await db.commit()
    return req
