"""Module marketplace — admin_modules table

Revision ID: 0042
Revises: 0041

Adds the table that powers /admin/modules (clone+build+spawn third-party
plugin modules from a git URL). Each row tracks one installed module:
the source repo it came from, the docker container IDs we spawned for
its FE+BE, the dedicated postgres schema/user we provisioned for it,
the service token it uses to call back into core /api/sdk/*, and the
parsed manifest as it was at install time.

See docs/MODULE-MARKETPLACE.md for the full design.

Module data tables themselves live in per-module schemas `mod_<slug>` and
are NOT touched by this migration — modules run their own alembic
inside their backend container.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_modules",
        sa.Column("id", postgresql.UUID(as_uuid=True),
                  server_default=sa.text("gen_random_uuid()"), primary_key=True),
        # Identity
        sa.Column("slug", sa.String(64), nullable=False, unique=True,
                  comment="lowercase identifier from manifest.name — used everywhere"),
        sa.Column("version", sa.String(32), nullable=False,
                  comment="manifest.version at install time"),
        # Source
        sa.Column("git_url", sa.Text(), nullable=False),
        sa.Column("git_ref", sa.String(128), nullable=False,
                  comment="branch or commit sha that was checked out"),
        sa.Column("git_token_enc", sa.Text(), nullable=True,
                  comment="Fernet-encrypted GitHub PAT (None = public repo)"),
        # Manifest snapshot (for menu rendering, permission checks, etc.)
        sa.Column("manifest", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        # Runtime — Docker
        sa.Column("fe_container_id", sa.String(128), nullable=True),
        sa.Column("be_container_id", sa.String(128), nullable=True),
        sa.Column("fe_image_tag", sa.String(256), nullable=True),
        sa.Column("be_image_tag", sa.String(256), nullable=True),
        # Runtime — DB isolation
        sa.Column("db_schema", sa.String(64), nullable=False,
                  comment="postgres schema name owned by this module"),
        sa.Column("db_user", sa.String(64), nullable=False,
                  comment="postgres role used by module BE container"),
        sa.Column("db_password_enc", sa.Text(), nullable=False,
                  comment="Fernet-encrypted password for db_user"),
        # Runtime — Auth
        sa.Column("service_token", sa.String(128), nullable=False, unique=True,
                  comment="opaque token module uses to call back into /api/sdk/*"),
        # Lifecycle
        sa.Column("status", sa.String(32), nullable=False, server_default="installing",
                  comment="installing | running | stopped | error"),
        sa.Column("last_error", sa.Text(), nullable=True),
        # Audit
        sa.Column("installed_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("installed_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        # TimestampMixin columns (model inherits them).
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    # Frequent reads: list endpoint orders by menu position pulled from
    # manifest JSONB; a B-tree on (status, slug) handles the dashboard.
    op.create_index("ix_admin_modules_status", "admin_modules", ["status"])


def downgrade() -> None:
    op.drop_index("ix_admin_modules_status", table_name="admin_modules")
    op.drop_table("admin_modules")
