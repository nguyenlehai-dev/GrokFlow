"""domain.login_template — per-domain login UI variant

Revision ID: 0026
Revises: 0025

Super_admin picks which login layout each tenant gets ("default" branded
or "admin" minimal console). The dedicated /admin/login URL always forces
the admin variant regardless of the domain's setting.
"""
from alembic import op
import sqlalchemy as sa


revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "domains",
        sa.Column(
            "login_template",
            sa.String(50),
            nullable=False,
            server_default="default",
        ),
    )


def downgrade() -> None:
    op.drop_column("domains", "login_template")
