"""plans + per-user entitlement overrides

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("entitlements", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_plans_code", "plans", ["code"])

    op.add_column("users", sa.Column("plan_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("users", sa.Column("entitlement_overrides", postgresql.JSONB, nullable=True))
    op.create_foreign_key(
        "fk_users_plan_id_plans",
        "users",
        "plans",
        ["plan_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_plan_id_plans", "users", type_="foreignkey")
    op.drop_column("users", "entitlement_overrides")
    op.drop_column("users", "plan_id")
    op.drop_index("ix_plans_code", table_name="plans")
    op.drop_table("plans")
