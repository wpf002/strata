"""004 push tokens

Revision ID: 004
Revises: 003
Create Date: 2026-04-22
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("push_token", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("push_platform", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "push_platform")
    op.drop_column("users", "push_token")
