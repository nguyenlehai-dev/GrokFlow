"""prompt_history — per-user recent prompts (server-synced)

Revision ID: 0046
Revises: 0045

Replaces the localStorage-based prompt history that leaked between
accounts on the same machine. Each user owns their list; multi-device
login sees the same set. Capped client-side at 20-50 entries per
job_type so the table doesn't bloat for power users — old entries get
trimmed by the application on insert.

Why UNIQUE(user_id, prompt): re-submitting the same prompt should bump
it to the top, not create a duplicate row. The application does an
UPSERT (insert ON CONFLICT update created_at) so the dedupe is at the
DB level, not application logic.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prompt_history",
        sa.Column("id", postgresql.UUID(as_uuid=True),
                  server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("job_type", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "prompt", name="uq_prompt_history_user_prompt"),
    )
    op.create_index(
        "ix_prompt_history_user_created",
        "prompt_history",
        ["user_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_prompt_history_user_created", table_name="prompt_history")
    op.drop_table("prompt_history")
