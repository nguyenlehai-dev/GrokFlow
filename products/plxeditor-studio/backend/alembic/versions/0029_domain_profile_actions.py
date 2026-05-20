"""domains.allowed_profile_actions — per-domain RBAC over Profile actions

Revision ID: 0029
Revises: 0028

Super_admin can revoke specific profile-row actions (auto_login,
upload_cookies, stop_vnc, disable, delete) for each tenant domain.
The frontend reads this list from /api/domains/config and renders the
revoked buttons as disabled; the backend re-enforces the rule on each
mutate endpoint so an enterprising tenant admin can't bypass the UI.

Default = full set ("all 5 actions allowed") so existing domains
aren't suddenly locked out post-migration. Existing rows are also
backfilled to the same default.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None

# Keep in sync with PROFILE_ACTIONS in app/modules/admin/domains/router.py
DEFAULT_JSON = (
    '["auto_login", "upload_cookies", "stop_vnc", "disable", "delete"]'
)


def upgrade() -> None:
    op.add_column(
        "domains",
        sa.Column(
            "allowed_profile_actions",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text(f"'{DEFAULT_JSON}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("domains", "allowed_profile_actions")
