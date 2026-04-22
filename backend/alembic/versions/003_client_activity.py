"""003 client activity

Revision ID: 003
Revises: 002
Create Date: 2026-04-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "client_activity",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), nullable=False),
        sa.Column("property_id", sa.String(255), nullable=False),
        sa.Column("activity_type", sa.String(50), nullable=False),
        sa.Column("count", sa.Integer, nullable=False, server_default="1"),
        sa.Column(
            "last_occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("activity_metadata", JSONB),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "client_id", "property_id", "activity_type",
            name="uq_client_property_type",
        ),
    )
    op.create_index("ix_client_activity_user_id", "client_activity", ["user_id"])
    op.create_index("ix_client_activity_client_id", "client_activity", ["client_id"])


def downgrade() -> None:
    op.drop_table("client_activity")
