"""007 add name and last_notified_property_ids to saved_searches

Revision ID: 007
Revises: 006
Create Date: 2026-04-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("saved_searches", sa.Column("name", sa.String(255), nullable=True))
    op.add_column(
        "saved_searches",
        sa.Column(
            "last_notified_property_ids",
            postgresql.JSONB(),
            nullable=True,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("saved_searches", "last_notified_property_ids")
    op.drop_column("saved_searches", "name")
