"""seed Customer plan — default paid plan, đủ entitlements cho khách

Revision ID: 0047
Revises: 0046

Thêm 1 plan "Customer" được dùng làm default khi cấp account khách qua
Quick Provision. Free plan vẫn giữ để trial; Customer kích hoạt mọi
feature thường dùng (image/video/I2I/I2V, quality high, 720p, 10s,
fun/custom modes) — trừ `video.spicy` (chỉ Enterprise) và admin UI flags.

Idempotent: ON CONFLICT(code) DO UPDATE — chạy nhiều lần không tạo
trùng, nhưng cập nhật entitlements/limits nếu thay đổi trong file này.

Downgrade: xoá hẳn row code='customer' (CASCADE sẽ giải phóng user nào
đang trỏ về nó — họ tự rớt về Free khi resolver chạy lần tiếp).
"""
from alembic import op


revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


CUSTOMER_PLAN_SQL = """
INSERT INTO plans (id, code, name, description, is_default, sort_order, entitlements, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'customer',
    'Customer',
    'Default plan dành cho khách đóng tiền — full features, quota vừa phải.',
    false,
    50,
    '{
      "limits": {
        "daily_jobs": 300,
        "monthly_jobs": 8000,
        "max_api_keys": 5,
        "max_profiles": 0,
        "max_concurrent_jobs": 5
      },
      "features": {
        "job.image": true,
        "job.video": true,
        "job.image_to_image": true,
        "job.image_to_video": true,
        "image.quality_high": true,
        "image.aspect_ratios_full": true,
        "video.resolution_720p": true,
        "video.duration_10s": true,
        "video.fun_mode": true,
        "video.custom_mode": true,
        "video.spicy": false,
        "ui.api_docs": true,
        "ui.webhooks": true,
        "ui.settings": true,
        "ui.audit_log": false,
        "api.public_v1": true
      }
    }'::jsonb,
    now(),
    now()
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    entitlements = EXCLUDED.entitlements,
    updated_at = now();
"""


def upgrade() -> None:
    op.execute(CUSTOMER_PLAN_SQL)


def downgrade() -> None:
    op.execute("DELETE FROM plans WHERE code = 'customer';")
