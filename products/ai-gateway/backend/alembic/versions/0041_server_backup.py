"""Server daily backup — config + history table

Revision ID: 0041
Revises: 0040

Adds per-server backup config + a history table for the audit trail.
Reuses the same `server-monitor` worker (no new container) — it checks
every minute whether each server's backup cron matches and fires.

Schema:

  • servers.backup_schedule_cron — 5-field UTC cron, NULL = off.
    Typical value: "0 2 * * *" = every day 02:00 UTC.
  • servers.backup_target_path — destination directory ON THE SERVER.
    Default "/opt/backups". Worker tars database dumps + selected
    folders into this path.
  • servers.backup_paths — JSON list of folders to tar (e.g.
    ["/home/vpsroot/grokflow"]). Empty list = skip filesystem tar,
    only do pg_dump.
  • servers.backup_db_name — Postgres DB name to pg_dump. NULL = skip
    DB backup (only filesystem tar).
  • servers.backup_retain_days — prune backups older than this. Default 7.

  • server_backup_history — one row per backup attempt:
    started_at, finished_at, status, output_path, size_bytes, error.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("servers",
        sa.Column("backup_schedule_cron", sa.String(100), nullable=True))
    op.add_column("servers",
        sa.Column("backup_target_path", sa.String(500),
                  nullable=False, server_default="/opt/backups"))
    op.add_column("servers",
        sa.Column("backup_paths", postgresql.JSONB(),
                  nullable=False, server_default="[]"))
    op.add_column("servers",
        sa.Column("backup_db_name", sa.String(100), nullable=True))
    op.add_column("servers",
        sa.Column("backup_retain_days", sa.Integer(),
                  nullable=False, server_default="7"))

    op.create_table(
        "server_backup_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "server_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("servers.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column("trigger", sa.String(20), nullable=False),  # scheduled | manual
        sa.Column(
            "triggered_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ),
        # queued | running | success | failed
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        # Where on the remote box the backup landed (full path).
        sa.Column("output_path", sa.Text(), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "started_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("server_backup_history")
    op.drop_column("servers", "backup_retain_days")
    op.drop_column("servers", "backup_db_name")
    op.drop_column("servers", "backup_paths")
    op.drop_column("servers", "backup_target_path")
    op.drop_column("servers", "backup_schedule_cron")
