"""014 enable row-level security on all public tables

Supabase's PostgREST exposes the `public` schema via the anon key, so any
table without RLS is readable/writable by anyone who knows the project URL.
The FastAPI backend connects directly via asyncpg as the `postgres` role,
which bypasses RLS, so enabling RLS with no policies locks the REST API
surface without breaking server-side queries. The frontend only uses
Supabase for auth (no `.from()` table access), so no policies are needed.

Revision ID: 014
Revises: 013
Create Date: 2026-04-29
"""
from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None

TABLES = (
    "users",
    "clients",
    "client_activity",
    "client_portals",
    "client_portal_activity",
    "client_transactions",
    "properties",
    "listings",
    "reports",
    "user_property_activity",
    "saved_searches",
    "watchlists",
    "portfolio_holdings",
    "underwriting_scenarios",
    "copilot_conversations",
)


def upgrade() -> None:
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')
