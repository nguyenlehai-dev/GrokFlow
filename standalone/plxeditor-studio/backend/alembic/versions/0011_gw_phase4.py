"""Phase 4: per-pool cooldown_seconds + gateway_key webhook_url

Revision ID: 0011
Revises: 0010
"""
from alembic import op
import sqlalchemy as sa


revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gw_pools",
        sa.Column("cooldown_seconds", sa.Integer(), nullable=False, server_default="300"),
    )
    op.add_column("gw_gateway_keys", sa.Column("webhook_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("gw_gateway_keys", "webhook_url")
    op.drop_column("gw_pools", "cooldown_seconds")
