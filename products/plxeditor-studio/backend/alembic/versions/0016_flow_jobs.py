"""flow_jobs table — native video-processing module

Revision ID: 0016
Revises: 0015
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "flow_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("operation", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="uploading"),
        sa.Column("progress", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("params", JSONB, nullable=True),
        sa.Column("input_files", JSONB, nullable=True),
        sa.Column("output_url", sa.Text, nullable=True),
        sa.Column("output_filename", sa.String(255), nullable=True),
        sa.Column("file_size", sa.BigInteger, nullable=True),
        sa.Column("duration", sa.Numeric(10, 3), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_flow_jobs_user_id", "flow_jobs", ["user_id"])
    op.create_index("ix_flow_jobs_status", "flow_jobs", ["status"])
    op.create_index("ix_flow_jobs_operation", "flow_jobs", ["operation"])


def downgrade() -> None:
    op.drop_index("ix_flow_jobs_operation", table_name="flow_jobs")
    op.drop_index("ix_flow_jobs_status", table_name="flow_jobs")
    op.drop_index("ix_flow_jobs_user_id", table_name="flow_jobs")
    op.drop_table("flow_jobs")
