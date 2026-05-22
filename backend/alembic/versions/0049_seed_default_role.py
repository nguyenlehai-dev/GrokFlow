"""seed default 'Customer' Role cho mỗi Domain hiện có

Revision ID: 0049
Revises: 0048

/admin/roles trước đó trống vì không có seed mặc định: mỗi domain phải
tự manually tạo role qua UI. Hệ quả: super_admin cấp user mới không có
role hợp lý để pick → user inherit toàn bộ domain.allowed_pages.

Migration này tạo 1 Role "Customer" cho TẤT CẢ Domain hiện có (không
seed cho tool_install — kiosk thường dùng allowed_pages của install
trực tiếp). allowed_pages cho khách điển hình:

  /create-video-pro/*  → CVP workspace (tool chính)
  /jobs                → Lịch sử job riêng
  /gallery, /gallery/* → Xem kết quả
  /api-keys            → Tự cấp key
  /api-docs            → Doc tích hợp
  /account             → Đổi profile/password

KHÔNG bao gồm /dashboard, /admin/*, /profiles (quản trị), /billing
(reseller manage thay khách).

Idempotent: ON CONFLICT (domain_id, name) DO NOTHING. Domain mới tạo
sau migration vẫn rỗng — cần backend hook trong create_domain để
auto-seed. Migration này chỉ chạy 1 lần cho dữ liệu hiện có.
"""
from alembic import op


revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None


CUSTOMER_ROLE_PAGES = [
    "/create-video-pro",
    "/create-video-pro/text-to-video",
    "/create-video-pro/image-to-video",
    "/create-video-pro/character-sync",
    "/create-video-pro/image-sync",
    "/create-video-pro/image-direct",
    "/jobs",
    "/gallery",
    "/gallery/images",
    "/gallery/videos",
    "/gallery/prompts",
    "/api-keys",
    "/api-docs",
    "/account",
]


SEED_SQL = f"""
INSERT INTO roles (id, domain_id, tool_install_id, name, description, allowed_pages, status, created_at, updated_at)
SELECT
    gen_random_uuid(),
    d.id,
    NULL,
    'Customer',
    'Default role cho khách dùng tool desktop / web — quyền truy cập CVP, jobs, gallery của riêng mình.',
    '{",".join(CUSTOMER_ROLE_PAGES)}'::text::text[],
    'active',
    now(),
    now()
FROM domains d
WHERE NOT EXISTS (
    SELECT 1 FROM roles r
    WHERE r.domain_id = d.id AND r.name = 'Customer'
);
"""


def upgrade() -> None:
    # allowed_pages is JSONB (model uses JSONType). Build JSONB array
    # via to_jsonb(array[...]) so values get properly quoted at DB
    # level — no risk of SQL injection from the page strings.
    import json
    pages_json = json.dumps(CUSTOMER_ROLE_PAGES)
    op.execute(f"""
        INSERT INTO roles (id, domain_id, tool_install_id, name, description, allowed_pages, status, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            d.id,
            NULL,
            'Customer',
            'Default role cho khách dùng tool desktop / web — quyền truy cập CVP, jobs, gallery của riêng mình.',
            '{pages_json}'::jsonb,
            'active',
            now(),
            now()
        FROM domains d
        WHERE NOT EXISTS (
            SELECT 1 FROM roles r
            WHERE r.domain_id = d.id AND r.name = 'Customer'
        );
    """)


def downgrade() -> None:
    op.execute("DELETE FROM roles WHERE name = 'Customer';")
