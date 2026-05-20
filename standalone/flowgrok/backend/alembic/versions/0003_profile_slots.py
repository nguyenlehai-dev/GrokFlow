"""profile multi-tab slots

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("active_jobs", sa.Integer(), server_default="0", nullable=False))
    op.add_column("profiles", sa.Column("max_concurrent_jobs", sa.Integer(), server_default="1", nullable=False))


def downgrade() -> None:
    op.drop_column("profiles", "max_concurrent_jobs")
    op.drop_column("profiles", "active_jobs")
