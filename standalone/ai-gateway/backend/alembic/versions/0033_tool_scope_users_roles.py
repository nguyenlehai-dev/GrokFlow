"""Tool scope for users + roles — separation from domain scope

Revision ID: 0033
Revises: 0032

Adds `tool_install_id` to users + roles so a user/role can be scoped to
a specific desktop install instead of a domain. Rule (enforced at login,
not in schema):

  - User has domain_id OR tool_install_id, never both.
  - Domain-scoped users can only log in from web (no X-Tool-Install-Id header).
  - Tool-scoped users can only log in from that install's desktop client.
  - super_admin / admin without scope = unrestricted.

We don't add a CHECK constraint enforcing "exactly one of domain_id /
tool_install_id" because super_admin has both NULL (unscoped). The login
gate is the source of truth.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column(
        "tool_install_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tool_installs.id", ondelete="SET NULL"),
        nullable=True,
    ))
    op.create_index(
        "ix_users_tool_install_id", "users", ["tool_install_id"],
    )

    op.add_column("roles", sa.Column(
        "tool_install_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tool_installs.id", ondelete="SET NULL"),
        nullable=True,
    ))
    op.create_index(
        "ix_roles_tool_install_id", "roles", ["tool_install_id"],
    )
    # roles.domain_id was NOT NULL since a role had to belong to a domain.
    # Tool-scoped roles have tool_install_id instead, so domain_id becomes
    # optional. Login enforcement requires exactly one of (domain_id,
    # tool_install_id) to be set on any role row.
    op.alter_column("roles", "domain_id", nullable=True)


def downgrade() -> None:
    op.alter_column("roles", "domain_id", nullable=False)
    op.drop_index("ix_roles_tool_install_id", table_name="roles")
    op.drop_column("roles", "tool_install_id")
    op.drop_index("ix_users_tool_install_id", table_name="users")
    op.drop_column("users", "tool_install_id")
