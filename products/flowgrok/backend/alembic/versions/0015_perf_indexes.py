"""Composite indexes for hot paths

Revision ID: 0015
Revises: 0014

Targets the queries flagged in the perf audit:

- gw_requests: list endpoint filters by domain_id and orders by created_at desc.
- payments:    dashboard revenue aggregation filters status='success' + paid_at.
- gw_pool_api_keys: pool resolver counts active keys per pool.
"""
from alembic import op


revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Per-tenant requests log query: WHERE domain_id=? ORDER BY created_at DESC.
    # The composite supports the typical "latest N requests for this tenant".
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_gw_requests_domain_created "
        "ON gw_requests (domain_id, created_at DESC)"
    )

    # Dashboard revenue (last N months): WHERE status='success' AND paid_at >= ?.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_payments_status_paid_at "
        "ON payments (status, paid_at)"
    )

    # Pool key resolver: WHERE pool_id=? AND status='active'.
    # Partial index keeps the index small (only active rows).
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_gw_pool_api_keys_pool_active "
        "ON gw_pool_api_keys (pool_id) WHERE status = 'active'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_gw_pool_api_keys_pool_active")
    op.execute("DROP INDEX IF EXISTS ix_payments_status_paid_at")
    op.execute("DROP INDEX IF EXISTS ix_gw_requests_domain_created")
