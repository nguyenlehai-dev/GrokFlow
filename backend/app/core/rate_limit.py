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
