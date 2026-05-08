import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.core.deps import AdminUser, DbSession
from app.core.exceptions import InvalidPayload, NotFound
from app.core.security import hash_password
from app.models import ApiKey, Job, Profile, User
from app.modules.audit import service as audit

from .schemas import AdminStats, AdminUserCreate, AdminUserOut, AdminUserUpdate

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStats)
async def stats(_admin: AdminUser, db: DbSession) -> AdminStats:
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    total_keys = (await db.execute(select(func.count(ApiKey.id)))).scalar_one()
    total_profiles = (await db.execute(select(func.count(Profile.id)))).scalar_one()
    total_jobs = (await db.execute(select(func.count(Job.id)))).scalar_one()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    succ = (
        await db.execute(select(func.count(Job.id)).where(Job.status == "success", Job.completed_at >= cutoff))
    ).scalar_one()
    fail = (
        await db.execute(select(func.count(Job.id)).where(Job.status == "failed", Job.completed_at >= cutoff))
    ).scalar_one()
    return AdminStats(
        total_users=total_users,
        total_api_keys=total_keys,
        total_profiles=total_profiles,
        total_jobs=total_jobs,
        jobs_24h_success=succ,
        jobs_24h_failed=fail,
    )


@router.get("/users", response_model=list[AdminUserOut])
async def list_users(_admin: AdminUser, db: DbSession) -> list[User]:
    rows = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    return list(rows)


@router.post("/users", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
async def create_user(payload: AdminUserCreate, admin: AdminUser, db: DbSession) -> User:
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise InvalidPayload(f"Email {payload.email} đã tồn tại")
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        status="active",
    )
    db.add(user)
    await db.flush()
    await audit.log_action(
        db, user_id=admin.id, action="admin_create_user", target_type="user", target_id=user.id,
        metadata={"email": user.email, "role": user.role},
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def update_user(user_id: uuid.UUID, payload: AdminUserUpdate, admin: AdminUser, db: DbSession) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise NotFound("user")
    changes: dict = {}
    if payload.full_name is not None:
        user.full_name = payload.full_name
        changes["full_name"] = payload.full_name
    if payload.role is not None:
        user.role = payload.role
        changes["role"] = payload.role
    if payload.status is not None:
        user.status = payload.status
        changes["status"] = payload.status
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
        changes["password"] = "***"
    await audit.log_action(
        db, user_id=admin.id, action="admin_update_user", target_type="user", target_id=user.id,
        metadata=changes,
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: uuid.UUID, admin: AdminUser, db: DbSession) -> None:
    if user_id == admin.id:
        raise InvalidPayload("Không thể tự xóa chính mình")
    user = await db.get(User, user_id)
    if not user:
        raise NotFound("user")
    await audit.log_action(
        db, user_id=admin.id, action="admin_delete_user", target_type="user", target_id=user.id,
        metadata={"email": user.email},
    )
    await db.delete(user)
    await db.commit()
