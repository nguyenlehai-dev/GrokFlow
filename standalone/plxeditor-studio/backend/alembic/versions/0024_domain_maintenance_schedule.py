"""domain.maintenance_starts_at + maintenance_announcement — scheduled window

Revision ID: 0024
Revises: 0023

When the admin schedules maintenance ahead of time, customers see a
marquee countdown banner; the cutover to the full MaintenancePage is
purely client-side (now >= maintenance_starts_at). No background job
needed.
"""
from alembic import op
import sqlalchemy as sa


revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "domains",
        sa.Column(
            "maintenance_starts_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "domains",
        sa.Column("maintenance_announcement", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("domains", "maintenance_announcement")
    op.drop_column("domains", "maintenance_starts_at")
