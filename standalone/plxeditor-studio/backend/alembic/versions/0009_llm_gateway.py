"""llm gateway: vendors, pools, functions, requests, gateway keys

Revision ID: 0009
Revises: 0008
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gw_vendors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("short_name", sa.String(50), nullable=True),
        sa.Column("domain", sa.String(200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_gw_vendors_code", "gw_vendors", ["code"])

    op.create_table(
        "gw_api_functions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(80), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("function_type", sa.String(50), nullable=False, server_default="image"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("request_schema", postgresql.JSONB, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_gw_api_functions_code", "gw_api_functions", ["code"])

    op.create_table(
        "gw_pools",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("function_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("model", sa.String(120), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["vendor_id"], ["gw_vendors.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["function_id"], ["gw_api_functions.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_gw_pools_vendor_id", "gw_pools", ["vendor_id"])
    op.create_index("ix_gw_pools_function_id", "gw_pools", ["function_id"])
    op.create_index("ix_gw_pools_code", "gw_pools", ["code"])

    op.create_table(
        "gw_pool_api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("pool_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("api_key", sa.Text(), nullable=False),
        sa.Column("project_id", sa.String(120), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["pool_id"], ["gw_pools.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_gw_pool_api_keys_pool_id", "gw_pool_api_keys", ["pool_id"])

    op.create_table(
        "gw_gateway_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("prefix", sa.String(40), nullable=False),
        sa.Column("key_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("allowed_functions", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_gw_gateway_keys_prefix", "gw_gateway_keys", ["prefix"])

    op.create_table(
        "gw_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("gw_id", sa.String(40), nullable=False, unique=True),
        sa.Column("gateway_key_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("pool_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("pool_key_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("function_code", sa.String(80), nullable=True),
        sa.Column("model", sa.String(120), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("request_body", postgresql.JSONB, nullable=True),
        sa.Column("response_body", postgresql.JSONB, nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["gateway_key_id"], ["gw_gateway_keys.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["vendor_id"], ["gw_vendors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["pool_id"], ["gw_pools.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["pool_key_id"], ["gw_pool_api_keys.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_gw_requests_gw_id", "gw_requests", ["gw_id"])
    op.create_index("ix_gw_requests_status", "gw_requests", ["status"])

    # Seed: default Google vendor + Image Generation function
    op.execute("""
        INSERT INTO gw_vendors (id, code, name, short_name, domain, description, status, created_at, updated_at)
        VALUES (gen_random_uuid(), 'google', 'Google', 'google', 'google',
                'Default vendor for Gemini integrations', 'active', now(), now())
    """)
    op.execute("""
        INSERT INTO gw_api_functions (id, code, name, function_type, description, status, created_at, updated_at)
        VALUES
        (gen_random_uuid(), 'image_generation', 'Image Generation', 'image',
            'Text-to-image and image-to-image', 'active', now(), now()),
        (gen_random_uuid(), 'text_generation', 'Text Generation', 'text',
            'Conversational + completion', 'active', now(), now()),
        (gen_random_uuid(), 'video_generation', 'Video Generation', 'video',
            'Text-to-video and image-to-video', 'active', now(), now())
    """)


def downgrade() -> None:
    op.drop_table("gw_requests")
    op.drop_table("gw_gateway_keys")
    op.drop_table("gw_pool_api_keys")
    op.drop_table("gw_pools")
    op.drop_table("gw_api_functions")
    op.drop_table("gw_vendors")
