import hmac
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


def _api_key_pepper() -> bytes:
    """Server-side secret mixed into api-key hash (peppered HMAC).

    Raw SHA256(full_key) is deterministic — DB leak → attacker mounts
    GPU brute against the known `uxpm_live_*` prefix. Mixing with a
    server pepper (settings.API_KEY_PEPPER, fallback to JWT_SECRET so
    existing deploys don't break) makes the hash unverifiable without
    the secret.

    Fallback to JWT_SECRET không phải lý tưởng (rotate JWT cũng rotate
    pepper → API key chết) nhưng đảm bảo first-deploy không cần config
    mới. Khuyến nghị set API_KEY_PEPPER riêng trong .env.prod.
    """
    pepper = getattr(settings, "API_KEY_PEPPER", None) or settings.JWT_SECRET
    return pepper.encode() if isinstance(pepper, str) else pepper


def generate_api_key(prefix_override: str | None = None) -> tuple[str, str, str]:
    """Return (full_key, prefix, hash). Full key is shown once to the user.

    Default prefix is `settings.API_KEY_PREFIX` (`uxpm_live`). Pass
    `prefix_override="gg"` (or any short string) to mint a legacy-style
    `gg_xxxxxx` key — useful when a customer's integration was built
    against an external service that used a different prefix. Auth still
    works regardless of prefix because validation hashes the FULL key,
    not the prefix portion.

    Hash dùng HMAC-SHA256(pepper, full_key) thay vì raw SHA256 — chống
    GPU brute khi DB leak. Output vẫn 64-char hex tương thích cột
    `api_keys.key_hash`. Xem _api_key_pepper().
    """
    prefix_root = prefix_override or settings.API_KEY_PREFIX
    raw = secrets.token_urlsafe(32)
    full = f"{prefix_root}_{raw}"
    prefix = full[: len(prefix_root) + 9]  # prefix + "_" + 8 chars
    key_hash = hash_api_key(full)
    return full, prefix, key_hash


def hash_api_key(full_key: str) -> str:
    """Peppered HMAC of API key. Backward-compatible mode: nếu key cũ
    trong DB là raw SHA256 (chưa peppered), verify_api_key_legacy ở
    lookup site sẽ fallback check raw SHA256 đồng thời — cho phép
    migration không bắt buộc rotate hết key trong 1 deploy."""
    return hmac.new(_api_key_pepper(), full_key.encode(), sha256).hexdigest()


def hash_api_key_legacy(full_key: str) -> str:
    """Raw SHA256 — chỉ dùng để verify api_keys sinh trước khi pepper
    được apply. Sau khi tất cả key migrate sang HMAC-SHA256, có thể
    xóa hàm này + cột raw hash khỏi lookup."""
    return sha256(full_key.encode()).hexdigest()
