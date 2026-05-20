import secrets
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRES_MINUTES)
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_short_token(subject: str, extra: dict[str, Any] | None = None, minutes: int = 30) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None


def generate_api_key(prefix_override: str | None = None) -> tuple[str, str, str]:
    """Return (full_key, prefix, hash). Full key is shown once to the user.

    Default prefix is `settings.API_KEY_PREFIX` (`uxpm_live`). Pass
    `prefix_override="gg"` (or any short string) to mint a legacy-style
    `gg_xxxxxx` key — useful when a customer's integration was built
    against an external service that used a different prefix. Auth still
    works regardless of prefix because validation hashes the FULL key,
    not the prefix portion.
    """
    prefix_root = prefix_override or settings.API_KEY_PREFIX
    raw = secrets.token_urlsafe(32)
    full = f"{prefix_root}_{raw}"
    prefix = full[: len(prefix_root) + 9]  # prefix + "_" + 8 chars
    key_hash = sha256(full.encode()).hexdigest()
    return full, prefix, key_hash


def hash_api_key(full_key: str) -> str:
    return sha256(full_key.encode()).hexdigest()
