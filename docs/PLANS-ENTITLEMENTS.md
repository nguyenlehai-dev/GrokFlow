# Plans & Entitlements — gói + phân quyền user

Tài liệu cho admin: cách dùng hệ thống gói (Plan) + override quyền theo từng user
để bán cho khách. Code/triển khai: xem [`backend/app/modules/entitlements/`](../backend/app/modules/entitlements/).

---

## Mô hình tổng quát

```
┌──────────┐         ┌──────────────────────────┐
│  Plan    │  1───n  │  User                    │
│  (gói)   │         │   plan_id  ───────────►  │   plan ưu tiên thấp hơn override
│ entitle- │         │   entitlement_overrides  │   override = riêng cho user này
│ ments JSON         └──────────────────────────┘
└──────────┘
```

- **Plan** (gói) — định nghĩa quyền/limits cho 1 nhóm khách. Ví dụ: Free, Basic, Pro, Enterprise.
- **User.plan_id** — gán user vào 1 gói. Để trống → dùng plan có `is_default=true`.
- **User.entitlement_overrides** — partial JSON đè lên plan. Dùng khi 1 khách cần khác chuẩn (vd. Free nhưng được mở Spicy).

**Effective entitlements** = `plan.entitlements` + `user.entitlement_overrides` (override thắng).
Admin (`role=admin`) luôn được full quyền — không bị check.

---

## Catalog: feature & limit có sẵn

Định nghĩa trong [`backend/app/modules/entitlements/catalog.py`](../backend/app/modules/entitlements/catalog.py).
Frontend mirror: [`frontend/src/core/entitlements/catalog.ts`](../frontend/src/core/entitlements/catalog.ts).

### Features (true/false)

| Key                          | Ý nghĩa                                  |
|------------------------------|-------------------------------------------|
| `job.image`                  | Cho tạo job ảnh                          |
| `job.video`                  | Cho tạo job video                        |
| `job.image_to_image`         | Upload ảnh để Grok dùng làm reference   |
| `job.image_to_video`         | Upload ảnh để Grok animate               |
| `image.quality_high`         | Chế độ Quality (vs Speed) cho image      |
| `image.aspect_ratios_full`   | Bật full danh sách aspect ratio          |
| `video.resolution_720p`      | Cho phép 720p (vs chỉ 480p)              |
| `video.duration_10s`         | Cho phép 10s (vs chỉ 6s)                 |
| `video.spicy`                | Spicy/NSFW mode 18+                      |
| `video.fun_mode`             | Fun mode                                 |
| `video.custom_mode`          | Custom mode                              |
| `api.public_v1`              | Truy cập API công cộng /api/v1/*         |
| `ui.api_docs`                | Hiện trang API Docs                      |
| `ui.audit_log`               | Hiện trang Audit Log                     |
| `ui.webhooks`                | Quản lý webhook                          |
| `ui.settings`                | Hiện trang Settings                      |

### Limits (số nguyên — `0` = không giới hạn)

| Key                     | Ý nghĩa                                       |
|-------------------------|-----------------------------------------------|
| `max_profiles`          | Số profile user được dùng (chuẩn bị tương lai)|
| `max_api_keys`          | Số API key tối đa user tạo được               |
| `max_concurrent_jobs`   | Tổng job in-flight đồng thời của user         |
| `daily_jobs`            | Giới hạn job/24h                              |
| `monthly_jobs`          | Giới hạn job/30 ngày                          |

---

## 4 plan mặc định

Seed tự động khi backend boot. Admin có thể sửa/thêm/xóa qua UI Admin.

| Plan         | Image | Video | Quality | 720p | 10s | Spicy | Concurrent | Daily | Monthly |
|--------------|:---:|:---:|:---:|:---:|:---:|:---:|---:|---:|---:|
| **Free**     | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | 1 | 10 | 100 |
| **Basic**    | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | 2 | 50 | 1.000 |
| **Pro**      | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | 5 | 200 | 5.000 |
| **Enterprise** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 20 | 2.000 | 50.000 |

`Free` được flag `is_default=true` — user mới mặc định vào plan này.

---

## Quy trình dành cho admin

### 1. Tạo user và gán gói

Vào trang **Admin → tab Users → "+ Tạo user"**:
- Email, password, full name, role (`user`)
- Chọn **Plan** từ dropdown

Nếu để trống Plan → user dùng plan mặc định (`Free`).

### 2. Mở/khóa quyền cho từng user (override)

Trong tab Users, bấm nút **"Quyền"** ở user đó:

- **Gói (Plan)** — chuyển sang plan khác
- **Features** — mỗi quyền có 3 trạng thái:
  - `Theo plan` — kế thừa quyền từ gói (mặc định)
  - `Bật (force)` — mở quyền dù plan tắt
  - `Tắt (force)` — chặn quyền dù plan bật
- **Limits** — bỏ trống = theo plan; nhập số = override; `0` = không giới hạn

Ví dụ thực tế:
- Khách trả thêm 200k để mở Spicy → set Plan=Basic, override `video.spicy = Bật`
- Khách demo cần 100 job/ngày trong tuần này → giữ Plan=Basic, override `daily_jobs = 100`

### 3. Sửa/thêm/xóa Plan

Tab **Plans / Gói**:
- Mỗi plan có code (machine), name (display), description, sort_order, is_default
- Editor có toàn bộ feature/limit từ catalog → chỉ tick + nhập số
- Chỉ 1 plan có `is_default=true`. Tick plan khác → tự động untick plan cũ
- Xóa plan: user nào đang dùng sẽ tự rơi về plan mặc định (FK ON DELETE SET NULL)

---

## Cơ chế enforce ở backend

Endpoint check theo thứ tự:

1. `POST /api/jobs` — kiểm tra:
   - `job.image` / `job.video` (theo `job_type`)
   - `job.image_to_image` / `job.image_to_video` (nếu có upload ảnh)
   - `image.quality_high` (nếu chọn Quality)
   - `video.resolution_720p`, `video.duration_10s` (theo option)
   - `video.spicy`, `video.fun_mode`, `video.custom_mode` (theo `mode`)
   - `max_concurrent_jobs` — đếm jobs `pending|queued|running|...` của user
   - `daily_jobs`, `monthly_jobs` — đếm jobs trong window 24h/30d

2. `POST /api/api-keys` — kiểm tra `max_api_keys`

3. `GET /api/auth/me` — trả về effective entitlements để frontend gate UI

Khi bị từ chối: HTTP **402 Payment Required**, body:
```json
{ "detail": { "code": "feature_not_allowed",
              "message": "Gói hiện tại không cho phép: Spicy mode (18+). Liên hệ admin để nâng cấp." }}
```

Frontend hiện toast với `message` này.

---

## Thêm feature/limit mới

Khi cần gate thêm quyền:

1. Thêm key vào `backend/app/modules/entitlements/catalog.py`:
   ```python
   FEATURES["my.new_feature"] = "Mô tả tiếng Việt"
   ```
2. Thêm key vào `frontend/src/core/entitlements/catalog.ts` cho FEATURE_KEYS.
3. Wire check ở backend (chỗ enforce — thường là service hoặc router):
   ```python
   eff = await get_effective_entitlements(db, user)
   require_feature(eff, "my.new_feature", "Mô tả")
   ```
4. Wire check ở frontend (UI gating):
   ```tsx
   const canX = useFeature(FEATURE_KEYS.myNewFeature);
   {canX && <SomeButton />}
   ```
5. Cập nhật DEFAULT_PLANS (mỗi plan có giá trị `false` cho key mới — user cần nâng plan để có).

Không cần migration — entitlements là JSON. Nhưng nên cập nhật seed các plan hiện hữu qua trang Admin → Plans.

---

## File quan trọng

| File | Vai trò |
|---|---|
| [`backend/app/modules/entitlements/catalog.py`](../backend/app/modules/entitlements/catalog.py) | Catalog feature/limit + 4 plan mặc định |
| [`backend/app/modules/entitlements/service.py`](../backend/app/modules/entitlements/service.py) | Resolver + helper enforce + seed |
| [`backend/app/modules/admin/router.py`](../backend/app/modules/admin/router.py) | Endpoint Plan CRUD + user override |
| [`backend/app/modules/auth/router.py`](../backend/app/modules/auth/router.py) | `/api/auth/me` trả về entitlements |
| [`backend/alembic/versions/0005_plans_entitlements.py`](../backend/alembic/versions/0005_plans_entitlements.py) | Migration tạo bảng plans + cột users.plan_id |
| [`frontend/src/core/auth/store.ts`](../frontend/src/core/auth/store.ts) | Store + hook `useFeature`/`useLimit` |
| [`frontend/src/core/entitlements/catalog.ts`](../frontend/src/core/entitlements/catalog.ts) | Mirror feature key cho frontend |
| [`frontend/src/modules/admin/AdminPage.tsx`](../frontend/src/modules/admin/AdminPage.tsx) | UI tab Users (Quyền) + tab Plans |
| [`frontend/src/modules/jobs/CreateJobModal.tsx`](../frontend/src/modules/jobs/CreateJobModal.tsx) | UI tạo job, gate option theo entitlements |
