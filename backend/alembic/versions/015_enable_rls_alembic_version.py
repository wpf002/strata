"""015 enable row-level security on alembic_version

Migration 014 covered every application table, but Alembic's own bookkeeping
table (`alembic_version`) is created outside our migration files and was left
open. Supabase's PostgREST exposes it via the anon key, so an attacker could
overwrite `version_num` and break future migrations. The backend connects as
the `postgres` role (BYPASSRLS), so Alembic and the API keep working; only
the anon REST surface gets locked out.

Revision ID: 015
Revises: 014
Create Date: 2026-05-06
"""
from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE alembic_version ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.execute("ALTER TABLE alembic_version DISABLE ROW LEVEL SECURITY")
