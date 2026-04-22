"""Add clients table

Revision ID: 002
Revises: 001
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("strategy", sa.String(50), nullable=True),
        sa.Column("min_price", sa.Integer, nullable=True),
        sa.Column("max_price", sa.Integer, nullable=True),
        sa.Column("target_markets", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("property_types", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("notes", sa.String(2000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_clients_user_id", "clients", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_clients_user_id", "clients")
    op.drop_table("clients")
