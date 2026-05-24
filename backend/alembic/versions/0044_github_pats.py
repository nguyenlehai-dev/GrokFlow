"""github_pats — saved GitHub PATs for module marketplace install reuse

Revision ID: 0044
Revises: 0043

Stores Fernet-encrypted GitHub Personal Access Tokens that admins have
saved while installing modules. Future install / Create-new dialogs can
pick from this dropdown instead of pasting the same PAT every time.

The token itself is never returned via the API — only `id`, `label`,
`github_user`, `last_used_at`. Internal services decrypt as needed.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "github_pats",
        sa.Column("id", postgresql.UUID(as_uuid=True),
                  server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("github_user", sa.String(120), nullable=True,
                  comment="resolved from GitHub /user when first saved"),
        sa.Column("token_enc", sa.Text(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_github_pats_user", "github_pats", ["github_user"])


def downgrade() -> None:
    op.drop_index("ix_github_pats_user", table_name="github_pats")
    op.drop_table("github_pats")