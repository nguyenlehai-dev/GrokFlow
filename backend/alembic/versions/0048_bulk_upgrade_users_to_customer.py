"""bulk-upgrade existing role='user' from Free → Customer

Revision ID: 0048
Revises: 0047

One-shot data migration: dịch chuyển toàn bộ user role='user' đang ở
plan Free (hoặc chưa có plan) sang plan Customer. Reseller chuyển hệ
thống sang mô hình trả tiền — Free vẫn giữ làm trial cho user mới đăng
ký tự (web register), còn user được admin cấp đều dùng Customer.

Mỗi user được tạo thêm/active một Subscription manual để khớp pattern
của update_user trong PATCH endpoint (entitlement resolver cần active
Subscription để honor paid plan).

KHÔNG động vào:
  - role='admin' / 'super_admin' / 'support'   (họ unscoped/entitled khác)
  - user đang trên Pro/Basic/Enterprise        (giữ nguyên gói đã pay)
  - user kiosk-bound (tool_install_id != null) (xử riêng nếu cần)

Downgrade: rollback các row sub_id mới tạo bằng provider='manual'+
description='auto-upgrade-0048', và đẩy user về Free.
"""
from alembic import op


revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


UPGRADE_SQL = """
-- 1. Đổi plan_id của user role='user' đang ở Free (hoặc chưa plan)
WITH customer_plan AS (
    SELECT id AS plan_id FROM plans WHERE code = 'customer'
), free_plan AS (
    SELECT id AS plan_id FROM plans WHERE code = 'free'
), affected AS (
    UPDATE users u
    SET plan_id = (SELECT plan_id FROM customer_plan)
    WHERE u.role = 'user'
      AND (
          u.plan_id IS NULL
          OR u.plan_id = (SELECT plan_id FROM free_plan)
      )
    RETURNING u.id, u.plan_id
)
-- 2. Tạo Subscription active manual cho mỗi user vừa upgrade
INSERT INTO subscriptions (
    id, user_id, plan_id, status, billing_cycle, provider,
    amount, currency, created_at, updated_at
)
SELECT
    gen_random_uuid(), a.id, a.plan_id, 'active', 'monthly',
    'manual', 0, 'VND', now(), now()
FROM affected a
ON CONFLICT DO NOTHING;
"""

DOWNGRADE_SQL = """
-- Trả về Free, xoá subscription manual auto-created
WITH customer_plan AS (
    SELECT id AS plan_id FROM plans WHERE code = 'customer'
), free_plan AS (
    SELECT id AS plan_id FROM plans WHERE code = 'free'
), affected AS (
    UPDATE users u
    SET plan_id = (SELECT plan_id FROM free_plan)
    WHERE u.role = 'user'
      AND u.plan_id = (SELECT plan_id FROM customer_plan)
    RETURNING u.id
)
DELETE FROM subscriptions s
WHERE s.user_id IN (SELECT id FROM affected)
  AND s.plan_id = (SELECT id FROM plans WHERE code = 'customer')
  AND s.provider = 'manual'
  AND s.amount = 0;
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
