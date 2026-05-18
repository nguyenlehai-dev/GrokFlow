"""Configurable quota reset hour + profile tier label

Revision ID: 0037
Revises: 0036

Two small additions reseller-flow needs:

1. `quota_reset_hour_utc` (0-23, default 0) on `domains` and `tool_installs`.
   Lets the admin pick which UTC hour the daily counter rolls over.
   Default 0 = midnight UTC (current behaviour). A VN-based tenant who
   wants "midnight Vietnam" rollover sets this to 17.

2. `tier` (default 'free') on `profiles`. Free-text label for now (kept as
   VARCHAR not enum so we can add 'pro' / 'enterprise' / etc. without
   migrations). Admin uses it to filter profile lists when adding to a
   project and to badge rows visually — does NOT affect worker routing.
"""
from alembic import op
import sqlalchemy as sa


revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "domains",
        sa.Column(
            "quota_reset_hour_utc", sa.Integer(),
            nullable=False, server_default="0",
        ),
    )
    op.add_column(
        "tool_installs",
        sa.Column(
            "quota_reset_hour_utc", sa.Integer(),
            nullable=False, server_default="0",
        ),
    )
    op.add_column(
        "profiles",
        sa.Column(
            "tier", sa.String(length=20),
            nullable=False, server_default="free",
        ),
    )


def downgrade() -> None:
    op.drop_column("profiles", "tier")
    op.drop_column("tool_installs", "quota_reset_hour_utc")
    op.drop_column("domains", "quota_reset_hour_utc")
