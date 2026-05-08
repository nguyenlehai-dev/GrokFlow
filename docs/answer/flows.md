# Luồng nghiệp vụ

## 1. Onboarding khách hàng

```
1. Admin tạo user (hoặc khách self-signup khi feature mở Phase 4).
2. Khách login dashboard.
3. Khách tạo Chrome Profile cho từng tài khoản provider.
4. Khách bấm Open Browser → tự đăng nhập tài khoản provider.
5. Khách bấm Check Session → backend xác nhận logged_in.
6. Khách tạo API Key với scope phù hợp.
7. Khách copy key một lần và lưu trong hệ thống của họ.
8. Khách gọi /v1/jobs/image hoặc /v1/jobs/video.
```

## 2. Lifecycle profile

```
created
  │ Open Browser
  ▼
opening ──────────────────┐
  │ Khách login + đóng    │
  │ Worker check session  │
  ▼                       │
logged_in ◄───────────────┤
  │                       │
  │ Pick by job worker    │
  ▼                       │
running_job               │
  │ Worker xong, unlock   │
  └─────► logged_in       │
                          │
  Cookie hết hạn ─────────┘
                          │
                          ▼
                       need_login
                          │
                          │ Khách login lại
                          ▼
                       logged_in
```

Nhánh blocked/expired:

```
logged_in ─ provider chặn ─► blocked  (admin xử lý)
logged_in ─ lâu không dùng ─► expired (xóa, tạo mới)
```

## 3. Lifecycle job

```
[client] POST /v1/jobs/image
   │
   ▼
[api] verify key + perm + rate limit
   │
   ▼
[api] tạo Job(status=queued) + JobLog "queued"
   │
   ▼
[redis] enqueue
   │
   ▼
[worker] pick job
   │
   ▼  status=running, started_at=now
   │
[worker] lock profile (status=running_job)
   │
   ▼  status=processing_provider
   │
[browser] mở Playwright với profile.profile_path
   │
   ▼
[provider] gửi prompt + chờ kết quả
   │
   ▼
[browser] download file
   │
   ▼  status=uploading_result
   │
[storage] upload + tạo File record
   │
   ▼
[worker] update job status=success, result_url, completed_at
   │
[worker] unlock profile (status=logged_in)
   │
   ▼
[client] GET /v1/jobs/{id} → success
```

## 4. Xử lý lỗi job

| Triệu chứng worker | Action profile | Action job |
|---|---|---|
| Cookie hết hạn / redirect login | `need_login` | `failed`, retry sau khi user login lại |
| Captcha | `need_login` | `failed` (manual) |
| Provider 5xx | giữ `logged_in` | retry với backoff (max_retry) |
| Browser crash | giữ trạng thái | retry 1 lần |
| Rate limit provider | `logged_in` | requeue + delay, hoặc đổi profile |
| Provider chặn account | `blocked` | `failed`, không retry |
| Timeout > JOB_TIMEOUT_SECONDS | unlock profile | `expired` |

## 5. Daily reset & cleanup (cron job — Phase 4)

```
00:00 UTC mỗi ngày:
  - Reset api_keys.used_today = 0
  - Cleanup file > N ngày trên storage
  - Cleanup profile status=expired > 30 ngày
  - Aggregate usage_logs vào báo cáo
```
