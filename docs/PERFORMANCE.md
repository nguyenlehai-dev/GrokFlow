# Performance Playbook

What's already tuned, what to monitor, and where to dial things up when
load grows.

## 1. Database

### Pool config (per worker)

`backend/app/core/database.py`:

```python
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=10,       # core pool
    max_overflow=20,    # burst slots when pool exhausted
    pool_pre_ping=True, # detect stale conns after Postgres restarts
    pool_recycle=1800,  # recycle every 30min
)
```

With 4 gunicorn workers (`GUNICORN_WORKERS=4`), worst case is
**4 × (10 + 20) = 120 connections**. If you bump workers, also bump
Postgres `max_connections` (default 100 → set to 150+ in `postgresql.conf`).

### Composite indexes (alembic 0015)

| Index | Used by | Why |
|---|---|---|
| `gw_requests (domain_id, created_at DESC)` | Requests admin list, dashboard counters | filter by domain_id + ORDER BY created_at DESC LIMIT N |
| `payments (status, paid_at)` | Dashboard revenue card | filter `status='success' AND paid_at >= cutoff` |
| `gw_pool_api_keys (pool_id) WHERE status='active'` | Pool resolver during `/execute` | hot path: pick a key from a pool |

Re-check yearly: `EXPLAIN ANALYZE` on the hot queries. Add an index
when a query starts doing seq scans on a table >100k rows.

### N+1 antidote

Every list endpoint that needs related entities uses
`bulk_fetch_map(db, Model, ids)` from `core/tenant.py`:

```python
# Bad (N+1):
out = []
for r in rows:
    vendor = await db.get(GwVendor, r.vendor_id)
    out.append({"name": vendor.name if vendor else None, ...})

# Good (2 queries total regardless of N):
vendors = await bulk_fetch_map(db, GwVendor, {r.vendor_id for r in rows})
out = [{"name": vendors[r.vendor_id].name if r.vendor_id in vendors else None, ...}
       for r in rows]
```

When adding a new list endpoint that joins data, do this from the start.

## 2. Redis cache

`backend/app/core/cache.py` provides `@redis_cached(ttl, key)`:

```python
@router.get("/api/domains/config")
@redis_cached(ttl=60, key="domain-config:{host}")
async def get_domain_config(host: str, db: DbSession) -> DomainConfig:
    ...
```

`key` is a python-format-string against the handler's kwargs. Cached
endpoints today:

| Endpoint                  | TTL  | Why |
|---|---|---|
| `GET /api/domains/config` | 60s  | FE hits on every page load |
| `GET /api/plans/public`   | 300s | Pricing page, rare changes |

Bust the cache from writes:

```python
from app.core.cache import invalidate

# After admin updates a domain row:
await invalidate(f"cache:domain-config:{d.hostname}")
```

**Fail-open**: a Redis hiccup just falls through to the handler. The
decorator never raises out to the caller — log warning only.

## 3. FE bundle

Each authed page is its own Vite chunk via `lazyPage()`:

```tsx
{ path: "jobs", element: lazyPage(() => import("./JobsPage"), "JobsPage") }
```

Initial bundle is now small enough that a cold mobile load (~3G) is
sub-2-second. Verify after large feature additions:

```bash
cd frontend && npm run build
# Check dist/assets/ — each route should have its own chunk like
# JobsPage-<hash>.js. If everything's in one fat chunk, audit your
# manifest entries.
```

To find heavy npm packages (one-off audit):

```bash
cd frontend && npm install --no-save rollup-plugin-visualizer
# Add to vite.config.ts plugins, build, open dist/stats.html
```

## 4. React Query

Global default in `frontend/src/main.tsx`:

```typescript
defaultOptions: {
  queries: {
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 10_000,           // ← 10s "fresh" window
  },
}
```

Pages that poll (`refetchInterval`) inherit this — they don't ALSO
re-fetch on remount/focus within 10s. For real-time data (job in flight,
playground response) opt out per-query: `staleTime: 0`.

## 5. Gunicorn

`backend/Dockerfile.prod`:

```dockerfile
CMD ["sh", "-c", "exec gunicorn app.main:app \
   --bind 0.0.0.0:8000 \
   --worker-class uvicorn.workers.UvicornWorker \
   --workers ${GUNICORN_WORKERS:-4} \
   --keep-alive 5 \
   --graceful-timeout 30 \
   --timeout 120"]
```

`GUNICORN_WORKERS` is env-driven — set in `.env.prod` to scale per VPS.
Rule of thumb for async uvicorn workers: **1 per vCPU** (not `2*CPU+1`
which is for sync workers). Each worker handles many concurrent requests
internally via the event loop.

## 6. nginx (host + frontend container)

- **Host nginx** (`/etc/nginx/sites-enabled/grokflow` and the per-domain
  vhosts in `/etc/nginx/grokflow-vhosts/`): proxy `/api/*` →
  `127.0.0.1:8000`, everything else → `127.0.0.1:5173`.
- **Container nginx** (frontend-prod): serves the built bundle with
  long-cache headers on hashed assets (`Cache-Control: immutable`).

If FE response time is slow, check both — bottleneck is usually the host
nginx not gzip-ing.

## 7. Monitoring tips

- **API latency**: `docker logs grokflow-backend-1 | grep "status_code"`
  picks up gunicorn access logs. Long requests have a non-trivial
  `request_time`.
- **DB**: `docker exec grokflow-postgres-1 psql -U grokflow -d grokflow
  -c "SELECT query, calls, mean_exec_time FROM pg_stat_statements
  ORDER BY mean_exec_time DESC LIMIT 10;"` (requires
  `pg_stat_statements` extension — enable in `postgresql.conf` once).
- **Redis cache hit rate**: `docker exec grokflow-redis-1 redis-cli info
  stats | grep keyspace_hits` — eyeball hits/misses ratio.

## 8. When something's slow — playbook

1. **Is it the network**? Check `time curl` from VPS itself vs from your
   laptop. If only laptop is slow, it's Cloudflare / your ISP, not us.
2. **Is it the FE bundle**? DevTools Network → "JS" filter → look for
   uncached big chunks on first paint. Should be < 200KB initial.
3. **Is it a single endpoint**? `time curl` it from the backend
   container. If slow there, it's our code/DB.
4. **N+1 suspect**? Set `APP_DEBUG=true` temporarily, restart backend,
   tail logs — SQLAlchemy logs every query. If you see >5 SELECTs per
   request, refactor with `bulk_fetch_map`.
5. **DB suspect**? `EXPLAIN ANALYZE` the offending query from psql.
   Seq scan on >100k rows → add an index.
