"""profile_domain_assignments join table — super_admin assigns profiles to domains

Revision ID: 0017
Revises: 0016
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_domain_assignments",
        sa.Column(
            "profile_id",
            UUID(as_uuid=True),
            sa.ForeignKey("profiles.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "domain_id",
            UUID(as_uuid=True),
            sa.ForeignKey("domains.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    # Reverse-direction index for "which domains can see profile X" lookups.
    # The composite PK already covers (profile_id, domain_id) → "is X assigned
    # to profile Y" works without a second index, but "list domains for profile
    # X" needs profile_id-leading which PK provides too. Add domain_id-leading
    # for the hot path: customer list query filters by their domain_id first.
    op.create_index(
        "ix_profile_domain_assignments_domain_id",
        "profile_domain_assignments",
        ["domain_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_profile_domain_assignments_domain_id",
        table_name="profile_domain_assignments",
    )
    op.drop_table("profile_domain_assignments")
