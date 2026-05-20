"""Module marketplace polish — tenant_modules + admin_modules.settings

Revision ID: 0043
Revises: 0042

Phase 3 additions on top of 0042's `admin_modules` core table:

- `tenant_modules` (domain_id, module_id) join table — per-tenant
  enablement so a single install can be turned on/off per domain.
- `admin_modules.settings` jsonb — per-module config blob the module
  can read via /api/sdk/settings (matches manifest.settings_schema if
  the manifest declares one).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Per-module settings blob — backed by a single jsonb so module authors
    # can ship arbitrary schemas without further migrations on the core side.
    op.add_column(
        "admin_modules",
        sa.Column("settings", postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default=sa.text("'{}'::jsonb")),
    )

    op.create_table(
        "tenant_modules",
        sa.Column("domain_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("domains.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("module_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("admin_modules.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False,
                  server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_tenant_modules_module", "tenant_modules", ["module_id"])


def downgrade() -> None:
    op.drop_index("ix_tenant_modules_module", table_name="tenant_modules")
    op.drop_table("tenant_modules")
    op.drop_column("admin_modules", "settings")
