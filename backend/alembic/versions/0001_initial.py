"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("full_name", sa.String(255)),
        sa.Column("role", sa.String(50), nullable=False, server_default="user"),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("key_prefix", sa.String(40), nullable=False, index=True),
        sa.Column("key_hash", sa.Text, nullable=False, unique=True, index=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("allowed_providers", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("allowed_job_types", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("rate_limit_per_minute", sa.Integer, server_default="60"),
        sa.Column("daily_limit", sa.Integer, server_default="1000"),
        sa.Column("used_today", sa.Integer, server_default="0"),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("profile_path", sa.Text, nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="created"),
        sa.Column("encrypted_cookie", sa.Text),
        sa.Column("encrypted_storage_state", sa.Text),
        sa.Column("last_login_check_at", sa.DateTime(timezone=True)),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
        sa.Column("error_message", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("api_key_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("api_keys.id", ondelete="SET NULL")),
        sa.Column("profile_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="SET NULL")),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("job_type", sa.String(50), nullable=False),
        sa.Column("prompt", sa.Text, nullable=False),
        sa.Column("input_payload", postgresql.JSONB),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending", index=True),
        sa.Column("priority", sa.Integer, server_default="0"),
        sa.Column("retry_count", sa.Integer, server_default="0"),
        sa.Column("max_retry", sa.Integer, server_default="3"),
        sa.Column("result_file_id", postgresql.UUID(as_uuid=True)),
        sa.Column("result_url", sa.Text),
        sa.Column("error_message", sa.Text),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "job_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("level", sa.String(50), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("context", postgresql.JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("jobs.id", ondelete="SET NULL")),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("file_type", sa.String(50), nullable=False),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("storage_driver", sa.String(50), nullable=False),
        sa.Column("storage_path", sa.Text, nullable=False),
        sa.Column("public_url", sa.Text),
        sa.Column("file_size", sa.BigInteger),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(255), nullable=False, index=True),
        sa.Column("target_type", sa.String(100)),
        sa.Column("target_id", postgresql.UUID(as_uuid=True)),
        sa.Column("ip_address", sa.String(100)),
        sa.Column("user_agent", sa.Text),
        sa.Column("metadata", postgresql.JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("files")
    op.drop_table("job_logs")
    op.drop_table("jobs")
    op.drop_table("profiles")
    op.drop_table("api_keys")
    op.drop_table("users")
