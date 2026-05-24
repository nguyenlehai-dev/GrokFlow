"""job_tags + jobs.is_favorite — tagging & favorites for jobs

Revision ID: 0045
Revises: 0044

Two additions to the jobs table:

  - jobs.is_favorite        bool, default false — quick-star bookmark
  - jobs.tags               jsonb (string[]), default '[]' — free-form
                             tag list per job (e.g. ["client-A","hero-shot"])

Why JSONB instead of a normalised tag table:
  - Per-user/per-job cardinality is low (typically <5 tags). Normalising
    forces a join + LIKE filter for what's effectively a tiny inline
    array. The trade-off is no global "list all tags" view without a
    GIN scan — acceptable since the UI lists tags per row, not globally.

Index choice:
  - is_favorite uses a partial index on (user_id) WHERE is_favorite — only
    starred rows pay write cost, and the "show my favorites" query goes
    straight to the index.
  - tags uses a GIN jsonb_ops index so filter-by-tag ('@>') stays fast.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("is_favorite", sa.Boolean(),
                  nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "jobs",
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_jobs_user_favorite "
        "ON jobs (user_id) WHERE is_favorite = true"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_jobs_tags_gin "
        "ON jobs USING gin (tags jsonb_path_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_jobs_tags_gin")
    op.execute("DROP INDEX IF EXISTS ix_jobs_user_favorite")
    op.drop_column("jobs", "tags")
    op.drop_column("jobs", "is_favorite")
