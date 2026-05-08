import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def log_action(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None,
    action: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Append-only audit log. Caller must NOT pass secrets in metadata."""
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            ip_address=ip,
            user_agent=user_agent,
            audit_metadata=metadata,
        )
    )
