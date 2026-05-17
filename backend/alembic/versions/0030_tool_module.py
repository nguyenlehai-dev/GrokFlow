"""Tool module — prompt_templates + chat_sessions

Revision ID: 0030
Revises: 0029

The Tool module (super_admin "GROK VIP TOOL" dashboard) ships two
new persistent surfaces:

  prompt_templates  — library of reusable prompts. Three-tier scope:
                      system (user_id NULL + domain_id NULL),
                      domain (user_id NULL + domain_id set),
                      user (user_id set). Resolver returns
                      `system ∪ own-user ∪ same-domain-public`.

  chat_sessions     — ChatGPT-style multi-turn conversations. Messages
                      live in a JSONB column (array of role/content
                      objects) — keeps the schema small while letting
                      the frontend render the whole history in one
                      request. Per-user only.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── prompt_templates ──────────────────────────────────────────
    op.create_table(
        "prompt_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("domain_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("domains.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("category", sa.String(50), nullable=False, server_default="text"),
        sa.Column("tags", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("thumbnail_url", sa.Text(), nullable=True),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_prompt_templates_category", "prompt_templates", ["category"])
    op.create_index("ix_prompt_templates_is_public", "prompt_templates", ["is_public"])

    # ── chat_sessions ─────────────────────────────────────────────
    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        # Title is auto-derived from the first user message; admin can rename.
        sa.Column("title", sa.String(200), nullable=False, server_default="New chat"),
        sa.Column("model", sa.String(120), nullable=True),
        # Message history. Shape: [{role: "user|assistant|system", content: "...", ts: ISO}, ...]
        sa.Column("messages", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_cost_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("chat_sessions")
    op.drop_index("ix_prompt_templates_is_public", table_name="prompt_templates")
    op.drop_index("ix_prompt_templates_category", table_name="prompt_templates")
    op.drop_table("prompt_templates")
