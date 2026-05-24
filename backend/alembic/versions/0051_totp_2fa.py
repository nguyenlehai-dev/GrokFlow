"""thêm totp_secret + totp_enabled cho User (2FA)

Revision ID: 0051
Revises: 0050

2-Factor Authentication TOTP (RFC 6238) cho admin/super_admin. user
tier không bắt buộc — họ có thể tự enable trong /account.

Cột:
  totp_secret   : base32 string, Fernet-encrypted at rest. NULL = 2FA off
  totp_enabled  : bool, true sau khi user verify code đầu tiên (ngừa
                  set secret nhưng quên scan QR → tự khoá tài khoản)
  totp_backup_codes : JSONB array of 8 SHA256(code), single-use khi mất
                      điện thoại

Backend /api/auth/login:
  - User có totp_enabled=true → yêu cầu thêm `totp_code` trong body
  - Nếu thiếu → 401 với code=totp_required (FE prompt nhập)
  - Sai → 401 với code=totp_invalid (đi qua login rate limit)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_secret", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column("totp_enabled", sa.Boolean(),
                  nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "users",
        sa.Column("totp_backup_codes",
                  postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "totp_backup_codes")
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
