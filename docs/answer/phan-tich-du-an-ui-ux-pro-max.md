# Phân tích dự án UI-UX-Pro-Max

## 1. Tổng quan dự án

### 1.1. Mục tiêu sản phẩm

Dự án **UI-UX-Pro-Max** là một hệ thống web dashboard cho phép người dùng/khách hàng quản lý API Key, quản lý Chrome Profile đăng nhập các nền tảng tạo ảnh/video như Grok hoặc Flow, tạo job xử lý ảnh/video, theo dõi trạng thái job, xem log lỗi, và sử dụng tài liệu API để tích hợp vào hệ thống riêng.

Điểm quan trọng của mô hình này là:

- Khách hàng tự đăng nhập tài khoản của họ vào từng Chrome Profile.
- Hệ thống chỉ quản lý profile, session, job queue và API nội bộ.
- Chủ hệ thống không trực tiếp sở hữu hoặc chia sẻ tài khoản Grok/Flow cho khách.
- Mỗi khách có thể tạo API Key riêng để gọi job tạo ảnh/video.
- Backend điều phối job, profile và lưu kết quả.

### 1.2. Định hướng sản phẩm khả thi

Không nên định vị hệ thống là tool “bypass” hoặc “lách” nền tảng bên thứ ba. Nên định vị là:

> Nền tảng quản lý profile trình duyệt, API Key và hàng đợi job tự động hóa phục vụ quy trình tạo nội dung ảnh/video theo tài khoản do khách hàng tự đăng nhập và tự quản lý.

Mô hình này khả thi hơn vì:

- Khách tự chịu trách nhiệm tài khoản bên thứ ba.
- Hệ thống chỉ hỗ trợ quản lý phiên làm việc và workflow.
- Có thể mở rộng sang nhiều provider khác nhau.
- Dễ bán cho khách hàng cần quản lý nhiều job tạo ảnh/video.

---

## 2. Phạm vi chức năng

### 2.1. Vai trò người dùng

#### Admin hệ thống

Admin là người sở hữu hệ thống. Admin có quyền:

- Quản lý toàn bộ user/khách hàng.
- Xem danh sách profile của khách.
- Kiểm tra trạng thái profile.
- Xem job, log, thống kê sử dụng.
- Khóa/mở API Key.
- Cấu hình provider.
- Cấu hình giới hạn job.
- Quản lý billing nếu có.

#### Khách hàng/User

Khách hàng có quyền:

- Đăng nhập vào dashboard.
- Tạo Chrome Profile mới.
- Mở profile để tự đăng nhập Grok/Flow.
- Tạo API Key.
- Chọn quyền cho API Key: image, video, grok, flow.
- Gọi API để tạo job.
- Xem trạng thái job.
- Xem kết quả đã tạo.
- Xem tài liệu API.

---

## 3. Kiến trúc tổng thể

### 3.1. Thành phần chính

```txt
UI-UX-Pro-Max
├── Frontend ReactJS
│   ├── Admin Dashboard
│   ├── Customer Dashboard
│   ├── API Key Management
│   ├── Profile Management
│   ├── Job Management
│   ├── API Docs
│   └── Settings
│
├── Backend Python FastAPI
│   ├── Auth Service
│   ├── API Key Service
│   ├── Profile Service
│   ├── Job Service
│   ├── Provider Service
│   ├── Browser Automation Service
│   ├── Storage Service
│   └── Audit Log Service
│
├── Worker Service
│   ├── Image Job Worker
│   ├── Video Job Worker
│   ├── Profile Health Checker
│   └── Result Collector
│
├── Database PostgreSQL
│   ├── users
│   ├── api_keys
│   ├── profiles
│   ├── jobs
│   ├── job_logs
│   ├── files
│   └── settings
│
├── Redis
│   ├── Job Queue
│   ├── Rate Limit
│   └── Temporary Cache
│
└── Storage
    ├── Local Storage
    ├── S3
    └── MinIO
```

### 3.2. Luồng hoạt động chính

```txt
Khách đăng nhập dashboard
        ↓
Tạo Chrome Profile
        ↓
Bấm mở Chrome Profile
        ↓
Khách tự đăng nhập Grok/Flow
        ↓
Đóng Chrome, hệ thống lưu session/cookie mã hóa
        ↓
Khách tạo API Key
        ↓
Khách gọi API tạo job image/video
        ↓
Backend đưa job vào queue
        ↓
Worker lấy profile phù hợp để chạy job
        ↓
Worker gửi prompt lên provider
        ↓
Lấy kết quả ảnh/video
        ↓
Lưu file vào storage
        ↓
Cập nhật trạng thái job
        ↓
Khách lấy kết quả qua API hoặc dashboard
```

---

## 4. Frontend ReactJS

### 4.1. Công nghệ đề xuất

```txt
ReactJS
TypeScript
Vite
React Router
TanStack Query
Zustand hoặc Redux Toolkit
React Hook Form
Zod/Yup Validation
TailwindCSS
Shadcn UI hoặc Ant Design
Axios
Lucide React hoặc Flaticon
```

### 4.2. Nguyên tắc thiết kế FE

Frontend nên viết theo hướng **core tái sử dụng**, không viết lặp lại nhiều component.

Các nguyên tắc chính:

- Tách module rõ ràng.
- Tách UI component và business logic.
- Tái sử dụng table, modal, form, button, status badge.
- Tạo service API riêng.
- Tạo hook riêng cho từng module.
- Tất cả form có validation.
- Tất cả API call có loading/error state.
- Không để API Key thật hiển thị toàn bộ sau khi tạo.

### 4.3. Cấu trúc thư mục FE

```txt
frontend/
├── src/
│   ├── app/
│   │   ├── router.tsx
│   │   ├── providers.tsx
│   │   └── layout.tsx
│   │
│   ├── core/
│   │   ├── api/
│   │   │   ├── axios.ts
│   │   │   └── endpoints.ts
│   │   ├── auth/
│   │   ├── constants/
│   │   ├── hooks/
│   │   ├── utils/
│   │   ├── types/
│   │   └── validations/
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── table/
│   │   ├── modal/
│   │   ├── form/
│   │   ├── badges/
│   │   └── layout/
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── api-keys/
│   │   ├── profiles/
│   │   ├── jobs/
│   │   ├── api-docs/
│   │   └── settings/
│   │
│   ├── assets/
│   │   ├── icons/
│   │   └── images/
│   │
│   └── main.tsx
```

### 4.4. Các module FE chi tiết

#### 4.4.1. Auth Module

Chức năng:

- Login.
- Logout.
- Refresh token.
- Forgot password nếu cần.
- Phân quyền route theo role.

Trang:

```txt
/login
/forgot-password
/reset-password
```

Component cần có:

```txt
LoginForm
AuthLayout
ProtectedRoute
RoleGuard
```

#### 4.4.2. Dashboard Module

Hiển thị tổng quan:

- Tổng số API Key.
- Tổng số profile.
- Tổng job hôm nay.
- Job thành công/thất bại.
- Profile cần đăng nhập lại.
- Usage chart.

Trang:

```txt
/dashboard
```

#### 4.4.3. API Key Module

Chức năng:

- Tạo API Key.
- Đặt tên key.
- Chọn allowed categories.
- Copy key sau khi tạo.
- Xem key dạng mask.
- Revoke key.
- Xem số request đã dùng.
- Xem lần dùng gần nhất.

Allowed categories đề xuất:

```txt
provider:grok
provider:flow
job:image
job:video
profile:read
job:read
```

UI khi tạo key:

```txt
Name: My Production Key
Allowed Providers:
[ ] Grok
[ ] Flow
Allowed Job Types:
[ ] Image
[ ] Video
Limit Per Day: 100
Expires At: Optional
```

#### 4.4.4. Profile Module

Đây là module quan trọng nhất.

Chức năng:

- Tạo profile mới.
- Đặt tên profile.
- Chọn provider: Grok/Flow.
- Mở Chrome profile để khách tự đăng nhập.
- Đóng profile.
- Kiểm tra trạng thái login.
- Xóa profile.
- Gắn profile với API Key hoặc user.
- Xem lần sử dụng gần nhất.

Trạng thái profile:

```txt
created
opening
logged_in
need_login
expired
blocked
running_job
disabled
```

Luồng tạo profile:

```txt
User bấm Create Profile
        ↓
Nhập tên profile
        ↓
Chọn provider
        ↓
Backend tạo folder profile riêng
        ↓
User bấm Open Browser
        ↓
Chrome mở bằng user-data-dir riêng
        ↓
User tự login tài khoản provider
        ↓
User đóng Chrome
        ↓
Backend kiểm tra session
        ↓
Profile chuyển sang logged_in
```

#### 4.4.5. Job Module

Chức năng:

- Tạo job image/video từ dashboard.
- Xem danh sách job.
- Lọc theo trạng thái.
- Xem chi tiết job.
- Retry job lỗi.
- Download kết quả.
- Xem log.

Trạng thái job:

```txt
pending
queued
running
processing_provider
uploading_result
success
failed
cancelled
expired
```

Loại job:

```txt
image_generation
video_generation
```

#### 4.4.6. API Docs Module

Chức năng:

- Hiển thị endpoint.
- Example request.
- Example response.
- Copy code mẫu.
- Hướng dẫn dùng API Key.
- Hiển thị quyền cần có cho từng API.

Endpoint cần document:

```txt
POST /v1/jobs/image
POST /v1/jobs/video
GET /v1/jobs/{job_id}
GET /v1/jobs
GET /v1/files/{file_id}
GET /v1/profiles
```

#### 4.4.7. Settings Module

Chức năng:

- Cấu hình user.
- Cấu hình provider.
- Cấu hình job limit.
- Cấu hình browser path.
- Cấu hình storage.
- Cấu hình webhook nếu có.

---

## 5. Backend Python

### 5.1. Công nghệ đề xuất

```txt
Python 3.11+
FastAPI
Uvicorn/Gunicorn
PostgreSQL
SQLAlchemy 2.0
Alembic
Pydantic
Redis
Celery hoặc RQ
Playwright hoặc Selenium
MinIO/S3/local storage
PyJWT hoặc fastapi-users
Passlib/bcrypt
Cryptography/Fernet
```

### 5.2. Nguyên tắc thiết kế BE

Backend nên viết theo hướng module hóa:

- Core dùng chung.
- Service layer xử lý nghiệp vụ.
- Repository layer xử lý database.
- API router chỉ nhận request và trả response.
- Worker tách riêng khỏi API server.
- Không chạy job nặng trực tiếp trong request HTTP.
- Cookie/session phải mã hóa trước khi lưu.
- API Key chỉ lưu hash, không lưu plain text.

### 5.3. Cấu trúc thư mục BE

```txt
backend/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── security.py
│   │   ├── encryption.py
│   │   ├── exceptions.py
│   │   └── logging.py
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   └── models.py
│   │   │
│   │   ├── api_keys/
│   │   ├── profiles/
│   │   ├── jobs/
│   │   ├── files/
│   │   ├── providers/
│   │   └── settings/
│   │
│   ├── workers/
│   │   ├── celery_app.py
│   │   ├── image_worker.py
│   │   ├── video_worker.py
│   │   └── profile_checker.py
│   │
│   ├── browser/
│   │   ├── profile_manager.py
│   │   ├── chrome_launcher.py
│   │   └── session_checker.py
│   │
│   ├── storage/
│   │   ├── local_storage.py
│   │   ├── s3_storage.py
│   │   └── minio_storage.py
│   │
│   └── providers/
│       ├── base.py
│       ├── grok_provider.py
│       └── flow_provider.py
│
├── alembic/
├── tests/
├── requirements.txt
└── docker-compose.yml
```

---

## 6. Database PostgreSQL

### 6.1. Bảng users

Lưu thông tin tài khoản khách hàng/admin.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Role đề xuất:

```txt
admin
user
support
```

Status đề xuất:

```txt
active
inactive
banned
pending
```

### 6.2. Bảng api_keys

API Key chỉ nên lưu hash, không lưu key gốc.

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(30) NOT NULL,
    key_hash TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    allowed_providers JSONB NOT NULL DEFAULT '[]',
    allowed_job_types JSONB NOT NULL DEFAULT '[]',
    rate_limit_per_minute INT DEFAULT 60,
    daily_limit INT DEFAULT 1000,
    used_today INT DEFAULT 0,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Ví dụ quyền:

```json
{
  "allowed_providers": ["grok", "flow"],
  "allowed_job_types": ["image", "video"]
}
```

### 6.3. Bảng profiles

Quản lý profile Chrome của từng khách.

```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    profile_path TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'created',
    encrypted_cookie TEXT,
    encrypted_storage_state TEXT,
    last_login_check_at TIMESTAMP,
    last_used_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Provider:

```txt
grok
flow
other
```

Status:

```txt
created
opening
logged_in
need_login
expired
blocked
running_job
disabled
deleted
```

### 6.4. Bảng jobs

Lưu toàn bộ job tạo ảnh/video.

```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    api_key_id UUID REFERENCES api_keys(id),
    profile_id UUID REFERENCES profiles(id),
    provider VARCHAR(50) NOT NULL,
    job_type VARCHAR(50) NOT NULL,
    prompt TEXT NOT NULL,
    input_payload JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INT DEFAULT 0,
    retry_count INT DEFAULT 0,
    max_retry INT DEFAULT 3,
    result_file_id UUID,
    result_url TEXT,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Job type:

```txt
image
video
```

Status:

```txt
pending
queued
running
processing_provider
success
failed
cancelled
expired
```

### 6.5. Bảng job_logs

Dùng để debug job lỗi.

```sql
CREATE TABLE job_logs (
    id UUID PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id),
    level VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    context JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Level:

```txt
info
warning
error
debug
```

### 6.6. Bảng files

Lưu thông tin file kết quả.

```sql
CREATE TABLE files (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    job_id UUID REFERENCES jobs(id),
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    mime_type VARCHAR(100),
    storage_driver VARCHAR(50) NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT,
    file_size BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 6.7. Bảng usage_logs

Dùng để thống kê usage và billing.

```sql
CREATE TABLE usage_logs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    api_key_id UUID REFERENCES api_keys(id),
    job_id UUID REFERENCES jobs(id),
    provider VARCHAR(50),
    job_type VARCHAR(50),
    cost_unit INT DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 6.8. Bảng audit_logs

Lưu hành động quan trọng.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    target_type VARCHAR(100),
    target_id UUID,
    ip_address VARCHAR(100),
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 7. API thiết kế đề xuất

### 7.1. Auth API

```txt
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
GET  /api/auth/me
```

### 7.2. API Key API

```txt
GET    /api/api-keys
POST   /api/api-keys
GET    /api/api-keys/{id}
DELETE /api/api-keys/{id}
PATCH  /api/api-keys/{id}/revoke
```

Tạo API Key:

```json
{
  "name": "Production Key",
  "allowed_providers": ["grok", "flow"],
  "allowed_job_types": ["image", "video"],
  "daily_limit": 1000,
  "expires_at": null
}
```

Response:

```json
{
  "id": "uuid",
  "name": "Production Key",
  "api_key": "uxpm_xxxxxxxxxxxxxxxxx",
  "warning": "Key chỉ hiển thị một lần, hãy copy và lưu lại."
}
```

### 7.3. Profile API

```txt
GET    /api/profiles
POST   /api/profiles
GET    /api/profiles/{id}
PATCH  /api/profiles/{id}
DELETE /api/profiles/{id}
POST   /api/profiles/{id}/open-browser
POST   /api/profiles/{id}/check-session
POST   /api/profiles/{id}/disable
```

Tạo profile:

```json
{
  "name": "Grok Account 01",
  "provider": "grok"
}
```

Open browser:

```json
{
  "profile_id": "uuid",
  "status": "opening",
  "message": "Chrome profile đang được mở. Vui lòng đăng nhập và đóng trình duyệt sau khi hoàn tất."
}
```

### 7.4. Job API nội bộ cho dashboard

```txt
GET    /api/jobs
POST   /api/jobs
GET    /api/jobs/{id}
POST   /api/jobs/{id}/retry
POST   /api/jobs/{id}/cancel
GET    /api/jobs/{id}/logs
```

### 7.5. Public API cho khách tích hợp

Các endpoint này dùng API Key.

```txt
POST /v1/jobs/image
POST /v1/jobs/video
GET  /v1/jobs/{job_id}
GET  /v1/jobs
GET  /v1/files/{file_id}
```

Ví dụ tạo image job:

```json
{
  "provider": "grok",
  "profile_id": "optional_uuid",
  "prompt": "A modern product UI dashboard, clean design",
  "options": {
    "size": "1024x1024",
    "quality": "high"
  }
}
```

Response:

```json
{
  "job_id": "uuid",
  "status": "queued",
  "message": "Job đã được đưa vào hàng đợi."
}
```

Lấy trạng thái job:

```json
{
  "job_id": "uuid",
  "status": "success",
  "result_url": "https://domain.com/files/xxx.png",
  "created_at": "2026-05-08T10:00:00Z",
  "completed_at": "2026-05-08T10:01:20Z"
}
```

---

## 8. Luồng quản lý profile khách tự dùng

### 8.1. Nguyên tắc

- Mỗi profile thuộc về một user.
- Mỗi profile có thư mục riêng trên server hoặc máy worker.
- Khách tự mở profile và tự đăng nhập.
- Hệ thống không hiển thị cookie cho admin hoặc khách.
- Cookie/session được mã hóa.
- Profile có thể hết hạn và yêu cầu khách đăng nhập lại.

### 8.2. Luồng tạo profile

```txt
1. User vào Settings/Profile.
2. User bấm Create Profile.
3. User nhập tên profile và chọn provider.
4. Backend tạo record trong DB.
5. Backend tạo thư mục profile riêng.
6. User bấm Open Browser.
7. Server mở Chrome với đúng user-data-dir.
8. User đăng nhập provider.
9. User đóng browser.
10. Backend kiểm tra session.
11. Nếu hợp lệ, profile chuyển sang logged_in.
12. Nếu chưa hợp lệ, profile chuyển sang need_login.
```

### 8.3. Luồng chạy job bằng profile

```txt
1. User gọi API tạo job.
2. Backend kiểm tra API Key.
3. Backend kiểm tra quyền provider/job type.
4. Backend chọn profile phù hợp.
5. Backend kiểm tra profile có đang bận không.
6. Job được đưa vào queue.
7. Worker mở browser context bằng profile đã lưu.
8. Worker gửi prompt.
9. Worker chờ kết quả.
10. Worker tải file kết quả.
11. Worker lưu file vào storage.
12. Worker cập nhật job success.
13. User lấy result_url.
```

### 8.4. Khi profile lỗi

Các lỗi thường gặp:

```txt
cookie_expired
need_login
provider_blocked
captcha_required
rate_limited
browser_crashed
network_error
unknown_error
```

Cách xử lý:

- Nếu cookie hết hạn: chuyển profile sang `need_login`.
- Nếu provider block: chuyển profile sang `blocked`.
- Nếu captcha: chuyển profile sang `need_login` hoặc `manual_required`.
- Nếu browser crash: retry job.
- Nếu rate limit: đổi profile khác hoặc delay job.

---

## 9. Bảo mật

### 9.1. API Key

- API Key chỉ hiển thị một lần khi tạo.
- Database chỉ lưu hash của key.
- Key nên có prefix để nhận diện.
- Có thể revoke key.
- Có thể giới hạn quyền theo provider/job type.
- Có thể giới hạn request theo phút/ngày.

Định dạng key gợi ý:

```txt
uxpm_live_xxxxxxxxxxxxxxxxxxxxxxxxx
uxpm_test_xxxxxxxxxxxxxxxxxxxxxxxxx
```

### 9.2. Cookie/session profile

- Không lưu cookie plain text.
- Mã hóa bằng Fernet/AES.
- Key mã hóa lưu trong biến môi trường.
- Không trả cookie về FE.
- Không cho admin xem cookie.
- Khi xóa profile phải xóa cả folder profile/session.

### 9.3. Phân quyền

Cần middleware kiểm tra:

```txt
JWT user auth
API Key auth
Role guard
Ownership guard
Rate limit guard
```

Ví dụ:

- User chỉ xem profile của chính họ.
- User chỉ xem job của chính họ.
- Admin xem được toàn bộ.
- API Key chỉ gọi được endpoint có quyền.

### 9.4. Audit log

Nên log các hành động:

```txt
login
create_api_key
revoke_api_key
create_profile
open_profile
check_profile
create_job
retry_job
delete_profile
```

---

## 10. Worker và Queue

### 10.1. Vì sao cần queue

Không nên xử lý job tạo ảnh/video ngay trong request API vì:

- Job có thể chạy lâu.
- Browser automation dễ timeout.
- Cần retry.
- Cần phân phối nhiều worker.
- Cần tránh server API bị treo.

### 10.2. Công nghệ

Có thể dùng:

```txt
Redis + Celery
Redis + RQ
Dramatiq
```

Đề xuất MVP:

```txt
Redis + RQ
```

Nếu hệ thống lớn hơn:

```txt
Redis + Celery
```

### 10.3. Queue đề xuất

```txt
image_jobs_queue
video_jobs_queue
profile_check_queue
high_priority_queue
```

### 10.4. Worker flow

```txt
Worker nhận job
        ↓
Lock profile để tránh nhiều job dùng cùng lúc
        ↓
Kiểm tra session
        ↓
Mở browser context
        ↓
Gửi prompt
        ↓
Chờ provider xử lý
        ↓
Tải kết quả
        ↓
Upload storage
        ↓
Update job success
        ↓
Unlock profile
```

---

## 11. Storage

### 11.1. Lựa chọn lưu file

MVP có thể dùng local storage:

```txt
/storage/users/{user_id}/jobs/{job_id}/result.png
/storage/users/{user_id}/jobs/{job_id}/result.mp4
```

Production nên dùng:

```txt
S3
Cloudflare R2
MinIO
Wasabi
```

### 11.2. File access

Nên có 2 cách:

- Private file: cần token mới xem được.
- Public signed URL: URL hết hạn sau một thời gian.

---

## 12. API Docs cho khách

### 12.1. Nội dung cần có

Trang API Docs nên có:

- Cách lấy API Key.
- Cách truyền API Key.
- Danh sách endpoint.
- Example curl.
- Example JavaScript.
- Example Python.
- Bảng mã lỗi.
- Bảng trạng thái job.

### 12.2. Ví dụ Authorization

```txt
Authorization: Bearer uxpm_live_xxxxxxxxxxxxxxxxx
```

### 12.3. Ví dụ curl tạo image job

```bash
curl -X POST https://api.yourdomain.com/v1/jobs/image \
  -H "Authorization: Bearer uxpm_live_xxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "grok",
    "prompt": "A clean modern SaaS dashboard UI",
    "options": {
      "size": "1024x1024"
    }
  }'
```

### 12.4. Mã lỗi đề xuất

```txt
401 invalid_api_key
403 permission_denied
404 job_not_found
409 profile_busy
422 invalid_payload
429 rate_limited
500 internal_error
503 provider_unavailable
```

---

## 13. Rủi ro và cách giảm rủi ro

### 13.1. Rủi ro về tài khoản provider

Rủi ro:

- Provider yêu cầu đăng nhập lại.
- Provider có captcha.
- Provider khóa tài khoản.
- Provider thay đổi giao diện.
- Provider giới hạn request.

Cách giảm:

- Cho khách tự quản lý tài khoản.
- Hiển thị trạng thái profile rõ ràng.
- Có cơ chế check session.
- Có retry mềm.
- Có log lỗi chi tiết.
- Không cam kết uptime tuyệt đối cho provider bên thứ ba.

### 13.2. Rủi ro kỹ thuật

Rủi ro:

- Browser automation tốn RAM/CPU.
- Nhiều job chạy cùng lúc làm server treo.
- File video dung lượng lớn.
- Queue bị nghẽn.

Cách giảm:

- Giới hạn số worker.
- Mỗi profile chỉ chạy 1 job tại một thời điểm.
- Có timeout cho job.
- Có giới hạn file size.
- Có cleanup file cũ.

### 13.3. Rủi ro bảo mật

Rủi ro:

- Lộ API Key.
- Lộ cookie profile.
- User truy cập job của user khác.
- Upload/download file không kiểm soát.

Cách giảm:

- Hash API Key.
- Mã hóa cookie.
- Ownership guard.
- Signed URL.
- Audit log.
- Rate limit.

---

## 14. MVP đề xuất

### Phase 1: Core Dashboard

Mục tiêu: Có hệ thống nền.

Chức năng:

- Login/logout.
- User management cơ bản.
- API Key CRUD.
- Profile CRUD.
- Job CRUD mock.
- API Docs cơ bản.

Kết quả:

- Khách có thể đăng nhập.
- Khách có thể tạo API Key.
- Khách có thể tạo profile record.
- Khách có thể đọc docs.

### Phase 2: Profile Browser

Mục tiêu: Quản lý Chrome Profile thật.

Chức năng:

- Tạo folder profile.
- Mở Chrome profile.
- Khách tự login.
- Check session.
- Lưu trạng thái profile.

Kết quả:

- Profile có thể đăng nhập thật.
- Dashboard biết profile còn sống hay cần login lại.

### Phase 3: Job Queue

Mục tiêu: Chạy job thật qua worker.

Chức năng:

- Tạo job image.
- Đưa job vào Redis queue.
- Worker xử lý job.
- Lưu log.
- Lưu kết quả.
- Trả result URL.

Kết quả:

- Khách gọi API có thể tạo job thật.

### Phase 4: Production Hardening

Mục tiêu: Sẵn sàng bán cho khách.

Chức năng:

- Rate limit.
- Daily limit.
- Audit log.
- Retry policy.
- Multi worker.
- Storage S3/MinIO.
- Monitoring.
- Billing/usage.

---

## 15. Checklist tính năng cần làm

### FE Checklist

```txt
[ ] Auth layout
[ ] Login page
[ ] Dashboard overview
[ ] API Key list
[ ] API Key create modal
[ ] API Key copy once modal
[ ] API Key revoke action
[ ] Profile list
[ ] Create profile modal
[ ] Open browser button
[ ] Check session button
[ ] Profile status badge
[ ] Job list
[ ] Job detail drawer
[ ] Job log viewer
[ ] Result preview
[ ] API Docs page
[ ] Settings page
[ ] Admin user management
```

### BE Checklist

```txt
[ ] FastAPI project setup
[ ] PostgreSQL connection
[ ] Alembic migration
[ ] JWT auth
[ ] User module
[ ] API Key module
[ ] API Key hash/verify
[ ] Permission middleware
[ ] Profile module
[ ] Chrome profile manager
[ ] Session encryption
[ ] Job module
[ ] Redis queue
[ ] Worker service
[ ] Storage service
[ ] Job logs
[ ] Rate limit
[ ] Audit logs
[ ] API Docs/OpenAPI
```

### DevOps Checklist

```txt
[ ] Dockerfile FE
[ ] Dockerfile BE
[ ] docker-compose.yml
[ ] PostgreSQL service
[ ] Redis service
[ ] Worker service
[ ] Nginx reverse proxy
[ ] ENV config
[ ] Log rotation
[ ] Backup database
[ ] Backup storage
[ ] Monitoring
```

---

## 16. Cấu hình ENV đề xuất

```env
APP_NAME=UI_UX_PRO_MAX
APP_ENV=production
APP_DEBUG=false

DATABASE_URL=postgresql://user:password@localhost:5432/uiuxpromax
REDIS_URL=redis://localhost:6379/0

JWT_SECRET=change_me
JWT_EXPIRES_MINUTES=1440

API_KEY_PREFIX=uxpm_live
ENCRYPTION_KEY=change_me_fernet_key

STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=/app/storage

CHROME_BINARY_PATH=/usr/bin/google-chrome
PROFILE_BASE_PATH=/app/browser_profiles

MAX_CONCURRENT_JOBS_PER_USER=2
MAX_CONCURRENT_JOBS_PER_PROFILE=1
DEFAULT_DAILY_LIMIT=100
JOB_TIMEOUT_SECONDS=600
```

---

## 17. Gợi ý UI màn hình

### 17.1. Sidebar

```txt
Dashboard
API Keys
Profiles
Jobs
API Docs
Settings
Admin
```

### 17.2. Profile List

Cột cần có:

```txt
Name
Provider
Status
Last Login Check
Last Used
Total Jobs
Actions
```

Actions:

```txt
Open Browser
Check Session
View Jobs
Disable
Delete
```

### 17.3. API Key List

Cột cần có:

```txt
Name
Prefix
Providers
Job Types
Daily Limit
Used Today
Last Used
Status
Actions
```

### 17.4. Job List

Cột cần có:

```txt
Job ID
Provider
Type
Profile
Status
Created At
Completed At
Actions
```

---

## 18. Kết luận

Dự án khả thi nếu triển khai theo hướng:

```txt
Khách tự quản lý tài khoản provider
Hệ thống quản lý profile, API Key, job queue và kết quả
Admin chỉ quản lý hạ tầng, profile status, log và giới hạn sử dụng
```

Không nên làm dự án theo hướng chia sẻ tài khoản hoặc tự ý dùng cookie của người khác. Nên làm rõ trong sản phẩm rằng:

- Khách tự đăng nhập tài khoản của họ.
- Khách chịu trách nhiệm với tài khoản provider.
- Hệ thống chỉ tự động hóa workflow nội bộ.
- Cookie/session được mã hóa và không hiển thị.

Nếu làm đúng kiến trúc, dự án có thể phát triển thành một nền tảng quản lý job tạo ảnh/video đa provider, có API riêng, có dashboard riêng và có thể bán cho khách hàng cần tích hợp tạo nội dung tự động.
