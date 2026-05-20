"""Notification producer helper.

Drop one of these calls anywhere a user-visible event happens and a row
lands in `notifications`, the bell icon picks it up on next 15s poll.
The function is non-throwing on purpose — a producer dying because of a
notification subsystem hiccup would be worse than a missed bell.

Respects `users.notification_prefs[kind].in_app` if set; falls back to
DEFAULT_NOTIFICATION_PREFS for newly-added event kinds so the user
doesn't have to re-save settings whenever a new producer ships.

Producers we currently hook into:
  - Grok worker → job success / failure   (workers/run.py)
  - Flow service → flow encode complete / failed (modules/flow/service.py — sync)
  - Profile becomes need_login   (workers/run.py session check)
  - (future) billing_due, system_announcement

Sync vs async: most producers live in async request handlers (use
log_notification_async). The Flow BackgroundTask path is sync and uses
log_notification_sync with its own short-lived engine — mirrors how
flow service.py already does sync DB updates.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, User
from app.modules.admin.settings.router import DEFAULT_NOTIFICATION_PREFS

logger = logging.getLogger(__name__)


def _in_app_enabled(user: User, kind: str) -> bool:
    prefs = user.notification_prefs or {}
    p = prefs.get(kind) or DEFAULT_NOTIFICATION_PREFS.get(kind) or {}
    return bool(p.get("in_app", True))


async def log_notification_async(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    kind: str,
    title: str,
    body: str | None = None,
    target_url: str | None = None,
    severity: str = "info",
) -> None:
    """Non-throwing — log + swallow errors so a notif hiccup doesn't fail
    the producer's main code path."""
    try:
        user = await db.get(User, user_id)
        if not user:
            return
        if not _in_app_enabled(user, kind):
            return
        db.add(
            Notification(
                user_id=user_id, kind=kind, title=title, body=body,
                target_url=target_url, severity=severity,
            )
        )
        # Caller is responsible for db.commit() — we just stage. Lets
        # the producer batch the notification with its own write.
    except Exception:  # noqa: BLE001
        logger.exception("notification staging failed for user=%s kind=%s", user_id, kind)


async def notify_admins_async(
    db: AsyncSession,
    *,
    domain_id: uuid.UUID | None,
    kind: str,
    title: str,
    body: str | None = None,
    target_url: str | None = None,
    severity: str = "info",
) -> int:
    """Broadcast a notification to every active admin / super_admin.

    Targeting rule:
      • domain_id given  → admins of that domain + every super_admin
      • domain_id None   → super_admins only (system-wide event)

    Used for events admins need to action — new upgrade request, large
    job failure, gateway key abuse, etc. Returns the number of rows
    staged so the caller can audit "broadcast hit N admins".
    """
    try:
        q = select(User).where(User.status == "active")
        if domain_id is None:
            q = q.where(User.role == "super_admin")
        else:
            # Either super_admin (global) OR admin tied to this domain.
            q = q.where(
                (User.role == "super_admin")
                | ((User.role == "admin") & (User.domain_id == domain_id))
            )
        admins = (await db.execute(q)).scalars().all()
        count = 0
        for admin in admins:
            if not _in_app_enabled(admin, kind):
                continue
            db.add(
                Notification(
                    user_id=admin.id, kind=kind, title=title, body=body,
                    target_url=target_url, severity=severity,
                )
            )
            count += 1
        # Caller commits.
        return count
    except Exception:
        logger.exception("notify_admins failed kind=%s domain_id=%s", kind, domain_id)
        return 0


def log_notification_sync(
    *,
    user_id: uuid.UUID,
    kind: str,
    title: str,
    body: str | None = None,
    target_url: str | None = None,
    severity: str = "info",
) -> None:
    """Sync variant for BackgroundTask producers (Flow service)."""
    from app.core.config import settings
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    try:
        url = settings.DATABASE_URL.replace("+asyncpg", "")
        engine = create_engine(url, future=True, pool_pre_ping=True)
        with Session(engine) as sess:
            user = sess.get(User, user_id)
            if not user:
                return
            prefs = user.notification_prefs or {}
            p = prefs.get(kind) or DEFAULT_NOTIFICATION_PREFS.get(kind) or {}
            if not p.get("in_app", True):
                return
            sess.add(
                Notification(
                    user_id=user_id, kind=kind, title=title, body=body,
                    target_url=target_url, severity=severity,
                )
            )
            sess.commit()
    except Exception:  # noqa: BLE001
        logger.exception("sync notification failed user=%s kind=%s", user_id, kind)
