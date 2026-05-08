# Rate limit

Áp dụng cho public API `/v1/*`. Internal dashboard `/api/*` chưa rate limit (Phase 4 sẽ thêm theo IP).

## Hai window

| Window | Storage | Reset |
|---|---|---|
| Per minute | Redis `rate:min:<key_id>:<minute_epoch>` | Tự expire 70s |
| Per day | DB `api_keys.used_today` | Cron `daily_reset` 00:00 UTC |

## Implementation

[`backend/app/core/rate_limit.py`](../../backend/app/core/rate_limit.py) dùng fixed-window counter:

```python
key = f"rate:min:{api_key.id}:{minute_bucket}"
count = await redis.incr(key)
if count == 1: await redis.expire(key, 70)
if count > api_key.rate_limit_per_minute: raise RateLimited
```

Nếu `count > rate_limit_per_minute` hoặc `used_today >= daily_limit` → `429 rate_limited`.

## Tradeoff

- **Fixed window** đơn giản, nhanh, nhưng có boundary issue (burst gần ranh phút).
- **Sliding window log** chính xác hơn nhưng cần ZSET + nhiều ops Redis. Cân nhắc khi traffic cao (Phase 4).

## Daily reset

Cron entry trên prod:

```
0 0 * * *  python -m app.workers.daily_reset
```

Chạy trong cùng container backend hoặc 1 cron service riêng. Idempotent — chạy 2 lần không hại.

## Per-IP rate limit (Phase 4)

Sẽ thêm middleware trên `/api/*` (đặc biệt `/api/auth/login`):

- 10 req/min per IP cho login
- 60 req/min per IP cho các endpoint khác

Storage cùng pattern Redis fixed-window.

## Bypass

- Admin endpoint không bypass rate limit chung — chỉ bypass khi rotate key, có endpoint riêng để admin reset `used_today` của 1 key cụ thể (Phase 4).
- IP allowlist per key (Phase 4): nếu IP request match `api_keys.allowed_ips` thì không tính minute window.
