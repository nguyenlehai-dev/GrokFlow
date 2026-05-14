"""replace profile_domain_assignments with grok_projects + project_domain_assignments

Revision ID: 0020
Revises: 0019

Breaking migration: tenant ↔ profile assignment moves from per-profile to
per-project granularity. Existing `profile_domain_assignments` are
DROPPED — super_admin must re-assign through the new Projects UI.
Reason: Grok supports multiple projects per account; mapping each tenant
to a project (instead of sharing the whole account) keeps chat history,
presets and brand voice separated per-tenant.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New: grok_projects — N projects per Profile
    op.create_table(
        "grok_projects",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        # index=True on this column auto-creates `ix_grok_projects_profile_id`
        # — no separate op.create_index needed (and adding one races on
        # second-run with "relation already exists").
        sa.Column(
            "profile_id", UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column("grok_project_id", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )

    # New: project_domain_assignments — many-to-many project ↔ domain
    op.create_table(
        "project_domain_assignments",
        sa.Column(
            "project_id", UUID(as_uuid=True),
            sa.ForeignKey("grok_projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "domain_id", UUID(as_uuid=True),
            sa.ForeignKey("domains.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )

    # Wire jobs to a specific project so the worker knows which Grok URL
    # to navigate to. Nullable for jobs created before this migration.
    # `index=True` on the column generates `ix_jobs_project_id` automatically.
    op.add_column(
        "jobs",
        sa.Column(
            "project_id", UUID(as_uuid=True),
            sa.ForeignKey("grok_projects.id", ondelete="SET NULL"),
            nullable=True, index=True,
        ),
    )

    # Drop the legacy table — super_admin re-assigns via /admin/projects.
    op.drop_table("profile_domain_assignments")


def downgrade() -> None:
    # Restore legacy assignment table (empty — data is gone, by design).
    op.create_table(
        "profile_domain_assignments",
        sa.Column(
            "profile_id", UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "domain_id", UUID(as_uuid=True),
            sa.ForeignKey("domains.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )
    op.drop_column("jobs", "project_id")
    op.drop_table("project_domain_assignments")
    op.drop_table("grok_projects")
