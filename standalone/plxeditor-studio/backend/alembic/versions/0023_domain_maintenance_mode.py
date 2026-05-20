"""domain.maintenance_mode — per-tenant maintenance window

Revision ID: 0023
Revises: 0022

Each domain can be put into maintenance independently so the team can
deploy a fix to one tenant without taking the rest of the platform
down. Two columns:

  maintenance_mode    bool — gate visible to non-admin users
  maintenance_message text — optional copy shown on the maintenance page
"""
from alembic import op
import sqlalchemy as sa


revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "domains",
        sa.Column(
            "maintenance_mode",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "domains",
        sa.Column("maintenance_message", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("domains", "maintenance_message")
    op.drop_column("domains", "maintenance_mode")
