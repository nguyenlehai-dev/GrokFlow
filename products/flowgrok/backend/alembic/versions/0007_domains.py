"""domains: per-domain access control

Revision ID: 0007
Revises: 0006
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "domains",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("hostname", sa.String(255), nullable=False, unique=True),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("allow_landing", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("allow_register", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("allow_login", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("allow_all_pages", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("allowed_pages", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("brand_name", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_domains_hostname", "domains", ["hostname"])

    # Seed default row: hostname='*' = fallback for unrecognized hosts
    op.execute("""
        INSERT INTO domains (id, hostname, label, description, status,
            allow_landing, allow_register, allow_login, allow_all_pages, allowed_pages,
            brand_name, created_at, updated_at)
        VALUES (gen_random_uuid(), '*', 'Default (fallback)',
            'Áp dụng cho domain chưa cấu hình riêng', 'active',
            true, true, true, true, '[]'::jsonb, NULL,
            now(), now())
        ON CONFLICT (hostname) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_index("ix_domains_hostname", table_name="domains")
    op.drop_table("domains")
