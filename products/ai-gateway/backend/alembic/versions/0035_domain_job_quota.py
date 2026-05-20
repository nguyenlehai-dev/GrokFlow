"""Domain job quota — daily generation limit per tenant

Revision ID: 0035
Revises: 0034

Adds the schema needed to gate job creation on a per-domain daily quota:

- `domains.jobs_quota_per_day` — nullable INT. When NULL the domain is
  unlimited (legacy behaviour). When set, each calendar day the domain
  can submit at most this many jobs across all its users.

- `domain_quota_periods` — counter table. One row per (domain, date).
  The job-create path atomically INSERT … ON CONFLICT DO UPDATE +1's
  the counter so concurrent submits don't double-spend the quota. The
  UTC date in `period_date` is the natural key alongside `domain_id`.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "domains",
        sa.Column("jobs_quota_per_day", sa.Integer(), nullable=True),
    )

    op.create_table(
        "domain_quota_periods",
        sa.Column(
            "domain_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("domains.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("period_date", sa.Date(), primary_key=True),
        sa.Column(
            "jobs_used", sa.Integer(), nullable=False, server_default="0",
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
    )
    # Lookups are always (domain_id, period_date) — already covered by the
    # composite PK. No additional index needed.


def downgrade() -> None:
    op.drop_table("domain_quota_periods")
    op.drop_column("domains", "jobs_quota_per_day")
