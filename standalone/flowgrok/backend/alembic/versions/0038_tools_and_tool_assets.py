"""Tool distribution: Tool + ToolAsset tables

Revision ID: 0038
Revises: 0037

Two tables for the admin's "Tool" workspace section:

  • `tools` — one row per distributable product (e.g. "Create Video Pro",
    "Grok Helper"). Carries the metadata shared across all release files
    of that product: display name (label), description, logo image.

  • `tool_assets` — release files attached to a tool. Each row is one
    downloadable artifact for a specific platform: `win` (an `.exe`/`.msi`
    installer), `mac` (a `.dmg`/`.pkg`), or `document` (PDF / changelog /
    user guide). A tool can have many assets across kinds; admin marks
    one per (tool, kind) as `is_latest` to highlight in the UI.

Both reference the existing `files` table for the actual blob — the logo
and each asset's binary are stored there. This reuses the file-storage
driver / TTL / download endpoints we already have.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tools",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column(
            "logo_file_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("files.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "homepage_url", sa.String(500), nullable=True,
        ),
        sa.Column(
            "sort_order", sa.Integer(), nullable=False, server_default="0",
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
    op.create_index("ix_tools_code", "tools", ["code"], unique=True)

    op.create_table(
        "tool_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tool_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tools.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column("kind", sa.String(20), nullable=False),  # "win" | "mac" | "document"
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("version", sa.String(50), nullable=True),
        sa.Column(
            "file_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("files.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "is_latest", sa.Boolean(), nullable=False, server_default="false",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "download_count", sa.Integer(), nullable=False, server_default="0",
        ),
        sa.Column(
            "sort_order", sa.Integer(), nullable=False, server_default="0",
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
    op.create_index(
        "ix_tool_assets_tool_kind", "tool_assets", ["tool_id", "kind"],
    )


def downgrade() -> None:
    op.drop_index("ix_tool_assets_tool_kind", table_name="tool_assets")
    op.drop_table("tool_assets")
    op.drop_index("ix_tools_code", table_name="tools")
    op.drop_table("tools")
