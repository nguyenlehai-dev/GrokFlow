"""Token-bucket-style rate limiting backed by Redis INCR + EXPIRE.

Two windows enforced per API key:
- per minute (60s window) → `rate:min:<key_id>:<minute_epoch>`
- per day (counter on api_keys.used_today, reset by daily cron)

The minute window uses fixed-window counter — simple and good enough for MVP.
Switch to leaky bucket / sliding log if precision matters later.
"""

from datetime import datetime, timezone

from app.core.exceptions import RateLimited
from app.core.redis_client import get_redis
from app.models import ApiKey


async def enforce_api_key_rate_limit(api_key: ApiKey) -> None:
    redis = get_redis()
    now = datetime.now(timezone.utc)
    minute_bucket = int(now.timestamp() // 60)
    key = f"rate:min:{api_key.id}:{minute_bucket}"

    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 70)  # buffer past minute boundary

    if count > api_key.rate_limit_per_minute:
        raise RateLimited()

    if api_key.daily_limit and api_key.used_today >= api_key.daily_limit:
        raise RateLimited()


async def enforce_login_rate_limit(ip: str, email: str | None = None) -> None:
    """Brute-force guard on /api/auth/login.

    Hai key độc lập + OR ngưỡng — kẻ tấn công khôn ngoan sẽ rotate IP,
    còn kẻ ngu sẽ rotate email. Bắn 429 khi vượt 1 trong 2:
      - per-IP    : 10 attempts / phút
      - per-email : 5 attempts / phút (catch password-spray cùng email)

    Reset bucket sau 60s. Window resolution là phút (fixed-window
    counter) — đủ tốt cho login. Sliding window không cần thiết.

    Call BEFORE bcrypt-verify để không tốn CPU verify trên IP đang
    spam — bcrypt mất ~150ms, đủ cho attacker dùng latency oracle nếu
    không có guard này.
    """
    redis = get_redis()
    now = datetime.now(timezone.utc)
    minute_bucket = int(now.timestamp() // 60)

    ip_key = f"rate:login:ip:{ip}:{minute_bucket}"
    ip_count = await redis.incr(ip_key)
    if ip_count == 1:
        await redis.expire(ip_key, 70)
    if ip_count > 10:
        raise RateLimited()

    if email:
        # Email-keyed bucket: lowercased để khớp với verify path
        email_key = f"rate:login:email:{email.lower()}:{minute_bucket}"
        email_count = await redis.incr(email_key)
        if email_count == 1:
            await redis.expire(email_key, 70)
        if email_count > 5:
            raise RateLimited()


async def enforce_service_token_rate_limit(slug: str, limit_per_minute: int = 300) -> None:
    """Per-module rate limit on /api/sdk/* calls so a misbehaving plugin
    can't DDoS the core. Fixed-window counter keyed on the module slug.

    Default 300/min = 5/sec sustained; modules doing batch operations can
    request a higher cap in the manifest (future).
    """
    redis = get_redis()
    now = datetime.now(timezone.utc)
    minute_bucket = int(now.timestamp() // 60)
    key = f"rate:sdk:{slug}:{minute_bucket}"

    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 70)
    if count > limit_per_minute:
        raise RateLimited()
