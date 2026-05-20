"""Tool installs — login_template + landing/login/register flags

Revision ID: 0032
Revises: 0031

Mirrors Domain's full public-area flag set so a desktop install can have
its OWN login screen template (e.g. force "admin" template = Admin Console
shell on launch) and its OWN allow_landing/login/register policy
independent of the underlying Domain row.
"""
from alembic import op
import sqlalchemy as sa


revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Login template — matches Domain.login_template enum: "default" or "admin"
    op.add_column("tool_installs", sa.Column(
        "login_template", sa.String(50), nullable=False,
        server_default="default",
    ))
    # Public-area flags. Defaults skew towards "this is a kiosk":
    # landing+register off, login on — because most desktop installs go
    # straight to the login screen, not the marketing landing page.
    op.add_column("tool_installs", sa.Column(
        "allow_landing", sa.Boolean, nullable=False, server_default=sa.text("false"),
    ))
    op.add_column("tool_installs", sa.Column(
        "allow_register", sa.Boolean, nullable=False, server_default=sa.text("false"),
    ))
    op.add_column("tool_installs", sa.Column(
        "allow_login", sa.Boolean, nullable=False, server_default=sa.text("true"),
    ))


def downgrade() -> None:
    op.drop_column("tool_installs", "allow_login")
    op.drop_column("tool_installs", "allow_register")
    op.drop_column("tool_installs", "allow_landing")
    op.drop_column("tool_installs", "login_template")
