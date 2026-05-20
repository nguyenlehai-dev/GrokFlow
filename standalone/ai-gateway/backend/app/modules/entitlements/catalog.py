"""Canonical feature + limit catalog and built-in plan definitions.

Single source of truth for what entitlements exist. Adding a new feature flag
or limit means appending here, then surfacing it in the admin UI.

Feature keys are dotted strings: <area>.<capability>. Limit keys are flat ints.
"""

# All known feature flags. Keep this list in sync with frontend/src/core/entitlements/catalog.ts
FEATURES: dict[str, str] = {
    # Job creation
    "job.image": "Tạo job ảnh",
    "job.video": "Tạo job video",
    "job.image_to_image": "Image-to-image (upload ảnh)",
    "job.image_to_video": "Image-to-video (upload ảnh)",
    # Image options
    "image.quality_high": "Chế độ Quality (image)",
    "image.aspect_ratios_full": "Tất cả aspect ratio (16:9, 9:16, 1:1, 4:3, 3:4)",
    # Video options
    "video.resolution_720p": "Resolution 720p",
    "video.duration_10s": "Duration 10s",
    "video.spicy": "Spicy mode (18+)",
    "video.fun_mode": "Fun mode",
    "video.custom_mode": "Custom mode",
    # API
    "api.public_v1": "Public API v1 (cho khách tích hợp)",
    # UI areas
    "ui.api_docs": "Trang API Docs",
    "ui.audit_log": "Trang Audit Log",
    "ui.webhooks": "Quản lý webhook",
    "ui.settings": "Trang Settings",
}

# All known numeric limits.
LIMITS: dict[str, str] = {
    "max_profiles": "Số profile tối đa",
    "max_api_keys": "Số API key tối đa",
    "max_concurrent_jobs": "Tổng số job chạy đồng thời",
    "daily_jobs": "Số job mỗi 24h (0 = không giới hạn)",
    "monthly_jobs": "Số job mỗi 30 ngày (0 = không giới hạn)",
}


# Default plan definitions. Seeded on startup; admins can edit afterward.
# Use 0 for unlimited limits (resolver treats 0 as no cap).
DEFAULT_PLANS: list[dict] = [
    {
        "code": "free",
        "name": "Free",
        "description": "Gói miễn phí dùng thử — chỉ tạo ảnh, chất lượng cơ bản",
        "is_default": True,
        "sort_order": 0,
        "price_vnd": 0,
        "price_usd_cents": 0,
        "entitlements": {
            "features": {
                "job.image": True,
                "job.video": False,
                "job.image_to_image": False,
                "job.image_to_video": False,
                "image.quality_high": False,
                "image.aspect_ratios_full": False,
                "video.resolution_720p": False,
                "video.duration_10s": False,
                "video.spicy": False,
                "video.fun_mode": False,
                "video.custom_mode": False,
                "api.public_v1": False,
                "ui.api_docs": False,
                "ui.audit_log": False,
                "ui.webhooks": False,
                "ui.settings": True,
            },
            "limits": {
                "max_profiles": 1,
                "max_api_keys": 1,
                "max_concurrent_jobs": 1,
                "daily_jobs": 10,
                "monthly_jobs": 100,
            },
        },
    },
    {
        "code": "basic",
        "name": "Basic",
        "description": "Gói cơ bản — ảnh + video chất lượng cơ bản",
        "is_default": False,
        "sort_order": 10,
        "price_vnd": 199000,
        "price_usd_cents": 999,
        "entitlements": {
            "features": {
                "job.image": True,
                "job.video": True,
                "job.image_to_image": True,
                "job.image_to_video": False,
                "image.quality_high": False,
                "image.aspect_ratios_full": True,
                "video.resolution_720p": False,
                "video.duration_10s": True,
                "video.spicy": False,
                "video.fun_mode": True,
                "video.custom_mode": False,
                "api.public_v1": False,
                "ui.api_docs": True,
                "ui.audit_log": False,
                "ui.webhooks": False,
                "ui.settings": True,
            },
            "limits": {
                "max_profiles": 2,
                "max_api_keys": 2,
                "max_concurrent_jobs": 2,
                "daily_jobs": 50,
                "monthly_jobs": 1000,
            },
        },
    },
    {
        "code": "pro",
        "name": "Pro",
        "description": "Gói chuyên nghiệp — đầy đủ chất lượng cao",
        "is_default": False,
        "sort_order": 20,
        "price_vnd": 599000,
        "price_usd_cents": 2999,
        "entitlements": {
            "features": {
                "job.image": True,
                "job.video": True,
                "job.image_to_image": True,
                "job.image_to_video": True,
                "image.quality_high": True,
                "image.aspect_ratios_full": True,
                "video.resolution_720p": True,
                "video.duration_10s": True,
                "video.spicy": False,
                "video.fun_mode": True,
                "video.custom_mode": True,
                "api.public_v1": True,
                "ui.api_docs": True,
                "ui.audit_log": True,
                "ui.webhooks": True,
                "ui.settings": True,
            },
            "limits": {
                "max_profiles": 5,
                "max_api_keys": 5,
                "max_concurrent_jobs": 5,
                "daily_jobs": 200,
                "monthly_jobs": 5000,
            },
        },
    },
    {
        "code": "enterprise",
        "name": "Enterprise",
        "description": "Gói doanh nghiệp — full quyền, bao gồm Spicy 18+",
        "is_default": False,
        "sort_order": 30,
        # Custom pricing — admin sets directly in DB; NULL means "Liên hệ".
        "price_vnd": None,
        "price_usd_cents": None,
        "entitlements": {
            "features": {
                "job.image": True,
                "job.video": True,
                "job.image_to_image": True,
                "job.image_to_video": True,
                "image.quality_high": True,
                "image.aspect_ratios_full": True,
                "video.resolution_720p": True,
                "video.duration_10s": True,
                "video.spicy": True,
                "video.fun_mode": True,
                "video.custom_mode": True,
                "api.public_v1": True,
                "ui.api_docs": True,
                "ui.audit_log": True,
                "ui.webhooks": True,
                "ui.settings": True,
            },
            "limits": {
                "max_profiles": 20,
                "max_api_keys": 20,
                "max_concurrent_jobs": 20,
                "daily_jobs": 2000,
                "monthly_jobs": 50000,
            },
        },
    },
]


# Admins always bypass entitlements; this is the "no limits" effective set
# returned for users with role == "admin".
ADMIN_ENTITLEMENTS: dict = {
    "features": {k: True for k in FEATURES},
    "limits": {k: 0 for k in LIMITS},  # 0 = unlimited
}
