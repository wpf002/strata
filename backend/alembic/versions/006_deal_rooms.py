"""006 deal rooms

Revision ID: 006
Revises: 005
Create Date: 2026-04-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "deal_rooms",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("property_id", sa.String(255), nullable=True),
        sa.Column("property_address", sa.String(500), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("participants", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "deal_room_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("deal_room_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("deal_rooms.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("assigned_to_email", sa.String(255), nullable=True),
        sa.Column("due_date", sa.String(20), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "deal_room_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("deal_room_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("deal_rooms.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("sender_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sender_name", sa.String(255), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("deal_room_messages")
    op.drop_table("deal_room_tasks")
    op.drop_table("deal_rooms")
