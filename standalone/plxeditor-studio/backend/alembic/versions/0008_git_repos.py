"""git_repos: multi-repo deploy management

Revision ID: 0008
Revises: 0007
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "git_repos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("github_repo", sa.String(255), nullable=False),
        sa.Column("branch", sa.String(100), nullable=False, server_default="main"),
        sa.Column("local_path", sa.Text(), nullable=False),
        sa.Column("compose_file", sa.String(255), nullable=True),
        sa.Column("env_file", sa.String(255), nullable=True),
        sa.Column("services", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.execute("""
        INSERT INTO git_repos (id, label, github_repo, branch, local_path,
            compose_file, env_file, services, sort_order, created_at, updated_at)
        VALUES (gen_random_uuid(), 'GrokFlow', 'nguyenlehai-dev/GrokFlow', 'prod',
            '/home/vpsroot/grokflow',
            'docker-compose.intranet.yml', '.env.prod',
            '["backend","frontend","worker","idle-cleanup"]'::jsonb,
            0, now(), now())
    """)


def downgrade() -> None:
    op.drop_table("git_repos")
