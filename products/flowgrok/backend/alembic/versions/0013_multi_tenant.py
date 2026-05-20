"""Multi-tenant: per-domain users + gateway keys/requests + super_admin role

Revision ID: 0013
Revises: 0012
"""
from alembic import op
import sqlalchemy as sa


revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Promote ALL existing admins to super_admin so the main `admin@grokflow.io`
    #    and any others currently tagged `admin` retain global access. New admins
    #    created from here on are domain-scoped.
    op.execute("UPDATE users SET role = 'super_admin' WHERE role = 'admin'")

    # 2. domain_id on users (NULL = unscoped — super_admin).
    op.add_column(
        "users",
        sa.Column("domain_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_domain_id", "users", "domains",
        ["domain_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_users_domain_id", "users", ["domain_id"])

    # 3. domain_id on gateway keys (tenant scope).
    op.add_column(
        "gw_gateway_keys",
        sa.Column("domain_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_gw_gateway_keys_domain_id", "gw_gateway_keys", "domains",
        ["domain_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_gw_gateway_keys_domain_id", "gw_gateway_keys", ["domain_id"])

    # 4. domain_id on requests (copied from key at request time).
    op.add_column(
        "gw_requests",
        sa.Column("domain_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_gw_requests_domain_id", "gw_requests", "domains",
        ["domain_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_gw_requests_domain_id", "gw_requests", ["domain_id"])


def downgrade() -> None:
    op.drop_index("ix_gw_requests_domain_id", table_name="gw_requests")
    op.drop_constraint("fk_gw_requests_domain_id", "gw_requests", type_="foreignkey")
    op.drop_column("gw_requests", "domain_id")

    op.drop_index("ix_gw_gateway_keys_domain_id", table_name="gw_gateway_keys")
    op.drop_constraint("fk_gw_gateway_keys_domain_id", "gw_gateway_keys", type_="foreignkey")
    op.drop_column("gw_gateway_keys", "domain_id")

    op.drop_index("ix_users_domain_id", table_name="users")
    op.drop_constraint("fk_users_domain_id", "users", type_="foreignkey")
    op.drop_column("users", "domain_id")

    op.execute("UPDATE users SET role = 'admin' WHERE role = 'super_admin'")
