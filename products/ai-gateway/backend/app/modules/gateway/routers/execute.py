"""/api/v1/gateway/functions/{code}/execute|submit — function invocation.

Two flavours:
  POST .../execute  — synchronous, returns the provider response
  POST .../submit   — async, returns pending; client polls /requests/{gw_id}/status

Picking a key:
  - highest priority that isn't on cooldown wins
  - 429 (quota exhausted) puts the key on a `pool.cooldown_seconds` cooldown
  - 401 (auth error) flips the key to inactive permanently
"""

import asyncio
import secrets

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.deps import DbSession
from app.core.exceptions import InvalidPayload
from app.core.http_client import get_http
from app.models import GwGatewayKey, GwPool, GwPoolApiKey, GwRequest, GwVendor
from app.modules.admin.audit import service as audit
from app.modules.gateway import schemas as s
from app.modules.gateway.auth import GatewayCaller, require_caller
from app.modules.gateway.services.execution import (
    do_execute,
    enforce_gateway_key_quota,
    resolve_pool,
)

router = APIRouter()


@router.post("/functions/{function_code}/execute", response_model=s.ExecuteResponse)
async def execute_function(
    function_code: str, payload: s.ExecuteRequest, db: DbSession,
    caller: GatewayCaller = Depends(require_caller),
) -> s.ExecuteResponse:
    """Run a function synchronously.

    Caller is either an admin JWT (for the Playground) or a gateway key
    (`gwk_live_…`) for external clients. Picks the highest-priority active
    key from a matching pool that isn't on cooldown, calls the vendor
    provider, and on 429 puts the key on a 5-min cooldown + tries next.
    """
    if not caller.can_call_function(function_code):
        raise InvalidPayload(
            f"Gateway key này không có quyền gọi function '{function_code}'"
        )
    await enforce_gateway_key_quota(db, caller)

    fn, pool, vendor, candidates = await resolve_pool(
        db, function_code, payload.model,
    )

    gw_id = "gw_" + secrets.token_hex(8)
    req = GwRequest(
        gw_id=gw_id, gateway_key_id=caller.gateway_key_id,
        domain_id=caller.domain_id,
        vendor_id=pool.vendor_id, pool_id=pool.id,
        function_code=function_code,
        request_body=payload.model_dump(),
        status="pending",
    )
    db.add(req)
    await db.flush()

    req = await do_execute(
        db, gw_id, pool, vendor, candidates, function_code, payload,
        caller.gateway_key_id,
    )

    used_key = await db.get(GwPoolApiKey, req.pool_key_id) if req.pool_key_id else None
    # Audit the gateway call so the per-domain audit-logs tab surfaces
    # LLM activity. caller.user_id may be None for gateway-key callers (no
    # JWT user); the row stays attached to the domain via metadata.
    await audit.log_action(
        db,
        user_id=getattr(caller, "user_id", None),
        action="gateway_execute",
        target_type="gw_request", target_id=req.id,
        metadata={
            "function": function_code,
            "vendor": vendor.code if vendor else None,
            "model": payload.model,
            "status": req.status,
            "domain_id": str(caller.domain_id) if caller.domain_id else None,
        },
    )
    await db.commit()
    return s.ExecuteResponse(
        request_id=req.id, gw_id=gw_id, status=req.status,
        pool_key_name=used_key.name if used_key else None,
        response=req.response_body,
        error_message=req.error_message if req.status == "failed" else None,
    )


@router.post("/functions/{function_code}/submit", response_model=s.ExecuteResponse)
async def submit_function(
    function_code: str, payload: s.ExecuteRequest, db: DbSession,
    caller: GatewayCaller = Depends(require_caller),
) -> s.ExecuteResponse:
    """Async variant of /execute — returns immediately with status=pending.

    The provider call fires off in a background task; the caller polls
    GET /requests/{gw_id}/status until status moves to succeeded / failed.
    Useful for video gen where upstream calls take 30+ seconds.
    """
    if not caller.can_call_function(function_code):
        raise InvalidPayload(
            f"Gateway key này không có quyền gọi function '{function_code}'"
        )
    await enforce_gateway_key_quota(db, caller)

    fn, pool, vendor, candidates = await resolve_pool(
        db, function_code, payload.model,
    )

    gw_id = "gw_" + secrets.token_hex(8)
    req = GwRequest(
        gw_id=gw_id, gateway_key_id=caller.gateway_key_id,
        domain_id=caller.domain_id,
        vendor_id=pool.vendor_id, pool_id=pool.id,
        function_code=function_code, model=payload.model or pool.model,
        request_body=payload.model_dump(),
        status="pending",
    )
    db.add(req)
    await db.flush()
    await db.commit()

    # Snapshot the IDs — candidate ORM objects can't cross session boundary
    candidate_ids = [k.id for k in candidates]
    pool_id, vendor_id = pool.id, vendor.id
    gateway_key_id = caller.gateway_key_id

    async def _runner() -> None:
        async with SessionLocal() as bg_db:
            bg_pool = await bg_db.get(GwPool, pool_id)
            bg_vendor = await bg_db.get(GwVendor, vendor_id)
            bg_candidates = [await bg_db.get(GwPoolApiKey, cid) for cid in candidate_ids]
            bg_candidates = [c for c in bg_candidates if c is not None]
            try:
                await do_execute(
                    bg_db, gw_id, bg_pool, bg_vendor, bg_candidates,
                    function_code, payload, gateway_key_id,
                )
            except Exception as e:  # noqa: BLE001 — last-resort logging
                try:
                    r = (await bg_db.execute(
                        select(GwRequest).where(GwRequest.gw_id == gw_id)
                    )).scalar_one_or_none()
                    if r:
                        r.status = "failed"
                        r.error_message = f"background runner crash: {e}"
                        await bg_db.commit()
                except Exception:  # noqa: BLE001
                    pass
            # Webhook delivery — fire only after the row has settled.
            if gateway_key_id:
                gk = await bg_db.get(GwGatewayKey, gateway_key_id)
                if gk and gk.webhook_url:
                    r = (await bg_db.execute(
                        select(GwRequest).where(GwRequest.gw_id == gw_id)
                    )).scalar_one_or_none()
                    if r:
                        try:
                            cli = get_http()
                            await cli.post(gk.webhook_url, json={
                                "gw_id": r.gw_id,
                                "status": r.status,
                                "function_code": r.function_code,
                                "model": r.model,
                                "error_message": r.error_message,
                                "latency_ms": r.latency_ms,
                            }, timeout=10.0)
                        except Exception:  # noqa: BLE001 — webhook is best-effort
                            pass

    asyncio.create_task(_runner())

    return s.ExecuteResponse(
        request_id=req.id, gw_id=gw_id, status="pending",
        pool_key_name=None, response=None, error_message=None,
    )
