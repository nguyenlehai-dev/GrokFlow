"""Phase 5: rate limit + cost tracking

Revision ID: 0012
Revises: 0011
"""
from alembic import op
import sqlalchemy as sa


revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gw_gateway_keys",
        sa.Column("rate_limit_per_minute", sa.Integer(), nullable=False, server_default="60"),
    )
    op.add_column(
        "gw_gateway_keys",
        sa.Column("daily_quota", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "gw_gateway_keys",
        sa.Column("used_today", sa.Integer(), nullable=False, server_default="0"),
    )

    op.add_column(
        "gw_pools",
        sa.Column("cost_per_million_input_cents", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "gw_pools",
        sa.Column("cost_per_million_output_cents", sa.Integer(), nullable=False, server_default="0"),
    )

    op.add_column("gw_requests", sa.Column("tokens_input", sa.Integer(), nullable=True))
    op.add_column("gw_requests", sa.Column("tokens_output", sa.Integer(), nullable=True))
    op.add_column("gw_requests", sa.Column("cost_cents", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("gw_requests", "cost_cents")
    op.drop_column("gw_requests", "tokens_output")
    op.drop_column("gw_requests", "tokens_input")
    op.drop_column("gw_pools", "cost_per_million_output_cents")
    op.drop_column("gw_pools", "cost_per_million_input_cents")
    op.drop_column("gw_gateway_keys", "used_today")
    op.drop_column("gw_gateway_keys", "daily_quota")
    op.drop_column("gw_gateway_keys", "rate_limit_per_minute")
