"""profiles.allows_video — per-profile image-only toggle

Revision ID: 0027
Revises: 0026

Admins flip this off for accounts that don't have video quota (Free tier,
quota-exhausted, dedicated-to-images, etc.) so the resolver skips them
when picking a profile for video jobs.

Default TRUE preserves existing behavior — every pre-0027 profile keeps
accepting both image and video jobs.
"""
from alembic import op
import sqlalchemy as sa


revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column(
            "allows_video",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("profiles", "allows_video")
