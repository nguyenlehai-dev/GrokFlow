# Kiến trúc tổng thể GrokFlow

## 1. Thành phần

```
┌──────────────────────────────────────────────────────────────┐
│                      Frontend (React + Vite)                  │
│   Admin Dashboard · Customer Dashboard · API Docs · Settings  │
└────────────────────────────────┬─────────────────────────────┘
                                 │ HTTPS (JSON)
┌────────────────────────────────▼─────────────────────────────┐
│                  Backend API (FastAPI · Python 3.11)          │
│  Auth · Users · API Keys · Profiles · Jobs · Files · Audit    │
└──────┬──────────────────────┬──────────────────────┬─────────┘
       │                      │                      │
   ┌───▼────┐           ┌─────▼─────┐         ┌──────▼──────┐
   │Postgres│           │   Redis   │         │   Storage    │
   │  (OLTP)│           │ (Queue +  │         │ (local / S3 /│
   │        │           │  cache)   │         │   MinIO)     │
   └────────┘           └─────┬─────┘         └──────────────┘
                              │
                  ┌───────────▼────────────┐
                  │ Worker (RQ/Celery)     │
                  │ · Image job worker     │
                  │ · Video job worker     │
                  │ · Profile health check │
                  └───────────┬────────────┘
                              │
                  ┌───────────▼────────────┐
                  │ Browser automation     │
                  │ (Playwright + Chrome)  │
                  └────────────────────────┘
```

## 2. Vai trò từng thành phần

| Component | Trách nhiệm |
|---|---|
| **Frontend** | UI cho admin và khách. Không giữ secret. Gọi backend qua JWT (dashboard) hoặc API Key (public). |
| **Backend API** | Xác thực, kiểm quyền, CRUD, đẩy job vào queue. Không chạy browser. |
| **Worker** | Lấy job từ queue, mở Chrome bằng profile của khách, tương tác provider, upload kết quả. |
| **Postgres** | Source of truth: users, api_keys, profiles, jobs, files, audit_logs. |
| **Redis** | Job queue (RQ), rate limit counter, session cache. |
| **Storage** | File ảnh/video kết quả. Local cho dev, S3/MinIO cho prod. |

## 3. Tách kênh: dashboard vs public API

Có hai bề mặt API tách biệt cùng chạy trên một FastAPI app:

- `/api/*` — dashboard internal. JWT (cookie hoặc Bearer). Dành cho UI.
- `/v1/*` — public API. API Key (`Authorization: Bearer uxpm_live_xxx`). Dành cho khách tích hợp.

Lý do: hai kênh có yêu cầu phân quyền, rate limit và versioning khác nhau. Trộn chung sẽ rối khi scale.

## 4. Luồng job (high-level)

1. Khách POST `/v1/jobs/image` với prompt + provider.
2. Backend verify API key → check quyền (`provider`, `job_type`) → check rate limit.
3. Backend chọn 1 profile khả dụng (`logged_in`, không `running_job`) → tạo `jobs` record `pending` → enqueue Redis.
4. Worker lấy job, lock profile (`running_job`), mở Playwright với `user-data-dir` = profile path.
5. Worker submit prompt → poll kết quả → download file → upload storage → tạo `files` record.
6. Worker update job `success` + `result_file_id`, unlock profile.
7. Khách poll `GET /v1/jobs/{id}` hoặc nhận webhook (sau MVP).

Chi tiết hơn xem [flows.md](./flows.md).

## 5. Quyết định thiết kế chính

- **Admin sở hữu profile pool, khách chỉ pick (v0.4+).** Mô hình SaaS: admin login Grok/Flow account 1 lần qua helper, profile vào pool. Khách tạo job chọn profile hoặc để hệ thống auto-pick. Khách không thấy/quản lý cookie.
- **API Key chỉ hiển thị 1 lần.** DB lưu `key_hash` (SHA-256) + `key_prefix` (~17 ký tự) cho hiển thị.
- **Cookie/session profile mã hóa Fernet.** Key lấy từ `ENCRYPTION_KEY` env. Không log, không trả về FE.
- **1 profile = 1 job tại 1 thời điểm.** Lock bằng status `running_job` + `SELECT FOR UPDATE skip_locked` Postgres.
- **Worker tách process khỏi API.** API không bao giờ block trên browser automation.

## 6. Stack & version

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript 5, Vite 5, TailwindCSS 3, Shadcn UI, TanStack Query 5, React Router 6, Zustand, React Hook Form + Zod |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic 2, Redis 7, RQ |
| Browser | Playwright (Chromium) |
| Storage | Local FS (dev) → S3 / MinIO (prod) |
| Infra | Docker Compose (dev), Nginx reverse proxy (prod) |
