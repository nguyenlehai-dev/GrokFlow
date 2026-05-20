"""Project ↔ tool_install assignments

Revision ID: 0034
Revises: 0033

Mirror of `project_domain_assignments` but keyed by tool install instead
of domain. Lets super_admin assign Grok projects to specific desktop
installs (kiosk) the same way they're currently assigned to tenant
domains. When a desktop client (X-Tool-Install-Id header) requests a
job, the resolver checks this table first for an exact install→project
match; falls back to the domain assignment chain if none.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_tool_install_assignments",
        sa.Column(
            "project_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("grok_projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tool_install_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tool_installs.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "enabled", sa.Boolean, nullable=False, server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("project_tool_install_assignments")
