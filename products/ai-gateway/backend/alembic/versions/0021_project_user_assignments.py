"""project_user_assignments — per-user GrokProject pinning

Revision ID: 0021
Revises: 0020

Adds a second assignment table for the finer (project ↔ user) grain.
Domain-wide rule in project_domain_assignments still applies; the user
table only narrows further. Resolution at job-pick time:

  user-specific match > user.domain-wide match > nothing visible
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_user_assignments",
        sa.Column(
            "project_id", UUID(as_uuid=True),
            sa.ForeignKey("grok_projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id", UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("project_user_assignments")
