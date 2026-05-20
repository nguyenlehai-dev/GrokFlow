"""servers table — managed VPS / remote hosts

Revision ID: 0025
Revises: 0024

Creates the `servers` table used by the new `/api/admin/servers` surface.
Each row is a remote host the backend SSHs into for start/stop/reboot
and live-metrics scraping. SSH credentials are Fernet-encrypted at rest
(same key as browser_profiles encryption).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "servers",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("hostname", sa.String(255), nullable=False),
        sa.Column("ssh_user", sa.String(120), nullable=False),
        sa.Column("ssh_password_encrypted", sa.Text(), nullable=True),
        sa.Column("ssh_key_path", sa.String(500), nullable=True),
        sa.Column("ssh_port", sa.Integer(), nullable=False, server_default="22"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tags", JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("servers")
