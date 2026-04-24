"""010 user property activity (leads)

Per-user engagement tracking across properties — powers the Leads page.

Revision ID: 010
Revises: 009
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_property_activity",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("property_id", sa.String(255), nullable=False),
        sa.Column("activity_type", sa.String(50), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("activity_metadata", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "property_id", "activity_type", name="uq_user_property_type"),
    )


def downgrade() -> None:
    op.drop_table("user_property_activity")
