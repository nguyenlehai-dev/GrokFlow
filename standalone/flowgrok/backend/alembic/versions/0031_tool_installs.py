"""Tool installs — desktop client registration + per-machine permissions

Revision ID: 0031
Revises: 0030

Each row represents one machine that ran the desktop installer. The
desktop app generates a stable `tool_id` (UUID) on first launch and
persists it in the OS user-data dir, then POSTs to /api/tool-installs/
register on every boot. Super_admin sees the registered machine in the
"Auth → Tool Installs" page and assigns:

  - a friendly label (e.g. "Khách A — PC Văn Phòng")
  - allowed_pages (list of route prefixes the install may see, OR
    allow_all_pages=true for unrestricted)
  - status (active / pending / disabled)

The auth resolver, when a request includes the `X-Tool-Install-Id`
header, looks up the matching install row and uses its allowed_pages
instead of the request's Domain row — same shape as domain-based RBAC
but keyed per-machine.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tool_installs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # tool_id is the customer-facing identifier — UUID picked by the
        # desktop client on first launch. Indexed because every auth-
        # gated request from a desktop session does a lookup on it.
        sa.Column("tool_id", sa.String(64), nullable=False, unique=True, index=True),
        # Machine identifiers reported by the desktop on register.
        # `machine_name` = OS hostname (e.g. "DESKTOP-AB12CD").
        # `public_ip`    = server-side observed IP (Cloudflare CF-Connecting-IP
        #                  if present, else request.client.host).
        sa.Column("machine_name", sa.String(255), nullable=True),
        sa.Column("public_ip", sa.String(64), nullable=True),
        # Admin-set fields (mirror Domain shape so the same auth resolver
        # logic can drop in with minimal branching).
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "status", sa.String(50), nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "allow_all_pages", sa.Boolean, nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "allowed_pages", postgresql.JSONB(astext_type=sa.Text()),
            nullable=False, server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("brand_name", sa.String(100), nullable=True),
        # If set, every login from this install gets scoped to this user_id
        # (single-tenant kiosk mode). Leave NULL for "any account can use
        # this install".
        sa.Column(
            "assigned_user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True, index=True,
        ),
        # Heartbeat / observability.
        sa.Column("first_seen_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("client_version", sa.String(50), nullable=True),
        # Standard timestamps.
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("tool_installs")
