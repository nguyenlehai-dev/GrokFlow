"""Server reboot scheduling — auto-reboot window + manual history

Revision ID: 0040
Revises: 0039

Adds two fields on Server for the auto-reboot scheduler:

  • reboot_schedule_cron — 5-field cron string (vd "0 3 * * 0" = mỗi
    Chủ nhật 03:00). NULL = scheduler skips this server.
  • reboot_min_uptime_hours — refuse to auto-reboot if uptime < N hours
    (default 24). Prevents reboot loops if server flaps and the schedule
    fires multiple times before uptime accrues.

And a server_reboot_history table for the audit trail — both auto-reboot
runs and admin-triggered manual reboots get a row. The schedule worker
checks this to enforce a minimum gap between consecutive auto-reboots."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "servers",
        sa.Column("reboot_schedule_cron", sa.String(100), nullable=True),
    )
    op.add_column(
        "servers",
        sa.Column(
            "reboot_min_uptime_hours", sa.Integer(),
            nullable=False, server_default="24",
        ),
    )

    op.create_table(
        "server_reboot_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "server_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("servers.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        # "scheduled" | "manual"
        sa.Column("trigger", sa.String(20), nullable=False),
        # Who pressed the button (manual only). NULL for scheduled.
        sa.Column(
            "triggered_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        # "queued" | "running" | "success" | "failed"
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "started_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("server_reboot_history")
    op.drop_column("servers", "reboot_min_uptime_hours")
    op.drop_column("servers", "reboot_schedule_cron")
