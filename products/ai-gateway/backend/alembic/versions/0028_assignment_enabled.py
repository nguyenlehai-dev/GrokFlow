"""project_*_assignments.enabled — per-row enable/disable toggle

Revision ID: 0028
Revises: 0027

Super_admin can now suspend an assignment without removing it. The
job resolver only considers rows where enabled = TRUE, so flipping
the flag temporarily revokes access without losing the assignment
config (useful when a tenant is paused, an account is rotating out,
etc.). Default TRUE keeps pre-0028 rows fully active.
"""
from alembic import op
import sqlalchemy as sa


revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("project_domain_assignments", "project_user_assignments"):
        op.add_column(
            table,
            sa.Column(
                "enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )


def downgrade() -> None:
    for table in ("project_domain_assignments", "project_user_assignments"):
        op.drop_column(table, "enabled")
