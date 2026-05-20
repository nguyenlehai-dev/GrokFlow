"""profile.max_concurrent_video — separate cap for Playwright video jobs

Revision ID: 0022
Revises: 0021

Video jobs still drive Playwright DOM heavily. Empirically a single
Chromium melts when more than ~4 video tabs run concurrently
(TargetClosedError). Image jobs went pure-HTTP API so they scale fine
with the existing max_concurrent_jobs cap. Add a second integer column
specifically for video so admins can keep image throughput high
(max_concurrent_jobs=12) without crashing the browser on video bursts.
"""
from alembic import op
import sqlalchemy as sa


revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column(
            "max_concurrent_video",
            sa.Integer(),
            nullable=False,
            server_default="4",
        ),
    )
    # Counter for active VIDEO jobs specifically. Total `active_jobs`
    # stays the overall counter (image + video); this one is just the
    # video subset so we can enforce two independent caps in a single
    # atomic UPDATE.
    op.add_column(
        "profiles",
        sa.Column(
            "active_video_jobs",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("profiles", "active_video_jobs")
    op.drop_column("profiles", "max_concurrent_video")
