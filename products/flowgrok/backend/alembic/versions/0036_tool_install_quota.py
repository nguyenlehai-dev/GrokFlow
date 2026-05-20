"""Tool Install job quota — per-machine override of domain quota

Revision ID: 0036
Revises: 0035

Mirrors the domain-quota schema from 0035 but keyed by tool install,
so a reseller (one domain) can sell different daily caps to different
desktop machines (one tool_install per machine):

  domain "vu.com": no domain quota
    install Khách 1: jobs_quota_per_day = 100
    install Khách 2: jobs_quota_per_day = 200

When a tool user submits a job the quota service prefers the install's
limit over the domain's (install overrides domain when set). Counters
live in `tool_install_quota_periods`, isolated from the domain counter.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tool_installs",
        sa.Column("jobs_quota_per_day", sa.Integer(), nullable=True),
    )

    op.create_table(
        "tool_install_quota_periods",
        sa.Column(
            "tool_install_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tool_installs.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("period_date", sa.Date(), primary_key=True),
        sa.Column("jobs_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("tool_install_quota_periods")
    op.drop_column("tool_installs", "jobs_quota_per_day")
