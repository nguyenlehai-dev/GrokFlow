# Provider integration

Mỗi nhà cung cấp (Grok, Flow, …) implement interface [`Provider`](../../backend/app/providers/base.py) với 2 method:

- `async run(JobInput) -> JobResult` — gửi prompt + lấy kết quả.
- `async check_session(profile_path) -> bool` — verify cookie còn sống.

## Lifecycle 1 lần `run`

```
Worker pick job
   │
   ▼
provider = get_provider(job.provider)
   │
   ▼
result = await provider.run(JobInput(prompt, job_type, options, profile_path))
   │
   ├─ result.success=True → save bytes, update job status=success
   └─ result.success=False → log error_code, status=failed (or retry if retryable)
```

## Implement provider mới

1. Tạo file `backend/app/providers/<name>_provider.py`.
2. Inherit `Provider`, set `name = "<name>"`.
3. Implement `run` + `check_session`.
4. Thêm vào `providers/__init__.py::get_provider`.
5. Thêm `<name>` vào `PROVIDERS` list ở `modules/api_keys/schemas.py` và `modules/profiles/schemas.py`.
6. Thêm test case ở `tests/test_public_v1.py`.

## Quy tắc viết provider

- **Không raise** trong `run` — convert mọi exception thành `JobResult(success=False, error_code=..., error_message=str(exc))`.
- **Không log secrets** (cookie, prompt full nếu sensitive). Log structure: `error_code`, `step`, `provider_message_truncated`.
- **Idempotent về profile state** — không thay đổi cookie nếu không cần. Worker sẽ update `last_used_at` và status sau.
- **Timeout** — provider tự đặt timeout nội bộ ≤ `JOB_TIMEOUT_SECONDS - 30s` để worker còn cleanup.

## Mã lỗi gợi ý

| `error_code` | Action ở worker |
|---|---|
| `cookie_expired` | profile → `need_login`, không retry |
| `captcha_required` | profile → `need_login`, manual |
| `rate_limited` | profile giữ `logged_in`, requeue + delay |
| `provider_blocked` | profile → `blocked`, không retry |
| `network_error` | retry tối đa `max_retry` |
| `unknown_error` | retry 1 lần, sau đó `failed` |

## Playwright tips

```python
from playwright.async_api import async_playwright

async with async_playwright() as p:
    context = await p.chromium.launch_persistent_context(
        user_data_dir=profile_path,
        headless=True,
        args=["--no-first-run", "--disable-blink-features=AutomationControlled"],
    )
    page = await context.new_page()
    await page.goto("https://grok.com/...", wait_until="networkidle")
    if "/login" in page.url:
        return JobResult(success=False, error_code="cookie_expired")
    # ... gửi prompt, chờ kết quả
    await context.close()
```

`launch_persistent_context` quan trọng — dùng đúng `user_data_dir` của profile, không tạo profile mới.
