"""add webhook fields to users

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("webhook_url", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("webhook_secret", sa.String(128), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "webhook_secret")
    op.drop_column("users", "webhook_url")
