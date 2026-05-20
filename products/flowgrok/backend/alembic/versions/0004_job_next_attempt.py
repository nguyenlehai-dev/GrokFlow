"""jobs.next_attempt_at for retry backoff

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_jobs_next_attempt_at", "jobs", ["next_attempt_at"])


def downgrade() -> None:
    op.drop_index("ix_jobs_next_attempt_at", table_name="jobs")
    op.drop_column("jobs", "next_attempt_at")
