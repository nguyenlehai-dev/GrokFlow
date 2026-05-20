"""Per-domain roles — named permission sets

Revision ID: 0014
Revises: 0013
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "roles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("domain_id", sa.Uuid(), sa.ForeignKey("domains.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        # Subset of the domain's allowed_pages. Stored as a JSONB array of
        # path strings for symmetry with Domain.allowed_pages.
        sa.Column("allowed_pages", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("domain_id", "name", name="uq_roles_domain_name"),
    )
    op.create_index("ix_roles_domain_id", "roles", ["domain_id"])

    op.add_column(
        "users",
        sa.Column("role_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_role_id", "users", "roles",
        ["role_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_users_role_id", "users", ["role_id"])


def downgrade() -> None:
    op.drop_index("ix_users_role_id", table_name="users")
    op.drop_constraint("fk_users_role_id", "users", type_="foreignkey")
    op.drop_column("users", "role_id")

    op.drop_index("ix_roles_domain_id", table_name="roles")
    op.drop_table("roles")
