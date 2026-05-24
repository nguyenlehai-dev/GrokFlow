"""thêm domain_id + tool_install_id vào invoices + subscriptions

Revision ID: 0050
Revises: 0049

User feedback: "Billing phải liên quan đến role → user → domain → tool".
Hiện Subscription/Invoice chỉ link tới User (user-level billing). Để
reseller có thể batch-invoice / báo cáo theo domain (Vũ Studio →
20 user → 20 invoice tổng cộng X VND), denormalize 2 trường này từ
user vào Invoice + Subscription. Domain admin tự filter list của
khách mình → không phải query through User mỗi lần.

Quan hệ chính vẫn là user-level (1 user = 1 subscription). Domain /
tool_install chỉ là "scope" để cluster báo cáo. Role không cần
field riêng vì role.domain_id đã có rồi.

Backfill: với row đã tồn tại, set domain_id = user.domain_id và
tool_install_id = user.tool_install_id. Index trên cả 2 để query
nhanh.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("invoices", "subscriptions"):
        op.add_column(
            table,
            sa.Column(
                "domain_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("domains.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.add_column(
            table,
            sa.Column(
                "tool_install_id", postgresql.UUID(as_uuid=True),
                sa.ForeignKey("tool_installs.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index(f"ix_{table}_domain_id", table, ["domain_id"])
        op.create_index(f"ix_{table}_tool_install_id", table, ["tool_install_id"])

        # Backfill: copy scope from owning user
        op.execute(f"""
            UPDATE {table} t
            SET domain_id = u.domain_id,
                tool_install_id = u.tool_install_id
            FROM users u
            WHERE u.id = t.user_id;
        """)


def downgrade() -> None:
    for table in ("invoices", "subscriptions"):
        op.drop_index(f"ix_{table}_tool_install_id", table_name=table)
        op.drop_index(f"ix_{table}_domain_id", table_name=table)
        op.drop_column(table, "tool_install_id")
        op.drop_column(table, "domain_id")
