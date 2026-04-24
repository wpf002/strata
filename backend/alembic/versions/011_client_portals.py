"""011 client portals

Adds client_portals + client_portal_activity tables. A portal is a
shareable collection of properties an agent curates for a specific client;
client views are attributed via a magic-link token (no login required).

Revision ID: 011
Revises: 010
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "client_portals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "agent_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("magic_link_token", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("property_ids", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_client_portals_token", "client_portals", ["magic_link_token"], unique=True)

    op.create_table(
        "client_portal_activity",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "portal_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("client_portals.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("property_id", sa.String(255), nullable=True),
        sa.Column("action_type", sa.String(50), nullable=False),
        sa.Column("client_name", sa.String(255), nullable=True),
        sa.Column("client_email", sa.String(255), nullable=True),
        sa.Column("activity_metadata", postgresql.JSONB(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("client_portal_activity")
    op.drop_index("ix_client_portals_token", table_name="client_portals")
    op.drop_table("client_portals")
