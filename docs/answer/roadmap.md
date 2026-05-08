# Roadmap MVP

Theo phân tích gốc [`phan-tich-du-an-ui-ux-pro-max.md`](./phan-tich-du-an-ui-ux-pro-max.md) §14.

## Phase 1 — Core Dashboard ✅

Mục tiêu: hệ thống nền chạy được, mock job, có đủ admin + audit + storage.

- [x] Backend FastAPI + SQLAlchemy async + Postgres + Alembic 0001
- [x] Auth JWT (login, me)
- [x] API Key CRUD + hash + scope + audit log
- [x] Profile CRUD (mock open-browser/check-session)
- [x] Job CRUD + worker (provider stub trả file giả)
- [x] Files module + Storage abstraction (local + S3 stub)
- [x] Public API v1 + rate limit Redis (per-minute + daily)
- [x] Audit log service + endpoints (self + admin)
- [x] Admin module (user CRUD, stats)
- [x] Provider abstraction + Grok/Flow stub
- [x] Browser profile manager (Chrome launcher stub)
- [x] Daily reset worker
- [x] Backend tests (auth, api-keys, public-v1)
- [x] Frontend React + Vite + Tailwind
- [x] Dashboard, API Keys, Profiles, Jobs (drawer), API Docs, Audit, Admin, Settings pages
- [x] Toast notifications
- [x] docker-compose
- [x] docs/api + docs/answer (architecture, flows, data-model, security, providers, storage, rate-limit, roadmap)

Kết quả: khách login → tạo key → tạo profile record → tạo job (worker chạy stub provider sinh file → user xem result + logs trong drawer). Admin quản lý user + xem audit toàn hệ thống.

## Phase 2 — Profile Browser ✅

- [x] `browser/playwright_session.py` — persistent context launcher với anti-bot args
- [x] `browser/profile_manager.py` — `import_cookies`, `check_session`, `export_storage_state`
- [x] Endpoint `POST /api/profiles/{id}/upload-cookies` — user upload Cookie-Editor JSON
- [x] Endpoint `POST /api/profiles/{id}/check-session` — Playwright headless check thật
- [x] Profile state machine (`logged_in`/`need_login`/`blocked`) cập nhật từ provider error_code
- [x] Frontend modal upload cookies + hướng dẫn Cookie-Editor

> Khách không thể mở GUI Chrome trên server headless. Approach: dùng Cookie-Editor extension export JSON từ local Chrome đã login → upload. Trade-off: cần re-upload khi session hết hạn (vài tuần).

## Phase 3 — Job Queue thật ✅

- [x] `providers/base.py` — Provider abstract + JobInput/JobResult/error codes chuẩn hóa
- [x] `providers/grok_provider.py` — Playwright flow gửi prompt + download image (selectors fallback chain)
- [x] `providers/flow_provider.py` — tương tự cho video
- [x] Worker dùng `SELECT FOR UPDATE skip_locked` để claim job atomic
- [x] Profile lock bằng status `running_job` + state machine
- [x] Retry policy: backoff 30s/2m/8m, terminal codes (cookie_expired/blocked) không retry
- [x] Storage: local working, S3 stub ready

> Selectors UI có thể outdated. Khi provider đổi UI → worker log `network_error` / `timeout` → cập nhật `PROMPT_TEXTAREA` / `IMAGE_RESULT_SELECTORS`.

## Phase 4 — Production Hardening ✅ (core)

- [x] Rate limit Redis fixed-window (per minute + daily) — done từ Phase 1
- [x] Daily reset cron worker (`app/workers/daily_reset.py`)
- [x] Audit log + endpoint UI xem (self + admin scope)
- [x] Webhook job complete (HMAC-SHA256 signed, 3 retry backoff 1s/4s/16s)
- [x] User self-service: đổi password + cấu hình webhook qua UI
- [x] Multi-worker scale: `docker compose up --scale worker=N` (lock atomic chống double-pick)
- [x] Sentry SDK integration (set `SENTRY_DSN` env để bật, no-op nếu không set)
- [x] CI workflow (`.github/workflows/ci.yml`) test + build
- [x] Deploy workflow (`.github/workflows/deploy.yml`) SSH deploy + smoke check
- [ ] Signed URL S3 (deferred — local storage đủ; impl khi STORAGE_DRIVER=s3)
- [ ] Prometheus metrics endpoint (deferred)
- [ ] Billing/usage aggregation report (deferred)
- [ ] E2E tests Playwright (deferred)

## Phase 5+ (future)

- Session revocation table cho JWT (đổi password kick all sessions)
- Provider plugin marketplace (Midjourney, Stable Diffusion, Sora, ...)
- Team workspace (shared profiles + API keys + billing)
- Multi-region S3 + CDN cho file kết quả
- Full E2E test suite + load testing

## Tracking

Mỗi feature mở 1 issue + branch `feat/<name>` từ `dev`. Doc cập nhật cùng PR.

```
dev
 ├── feat/phase2_browser_launch
 ├── feat/phase3_provider_grok
 └── feat/phase4_rate_limit
```
