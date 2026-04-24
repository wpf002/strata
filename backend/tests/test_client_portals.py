"""Tests for the client_portals router — CRUD, public view, and activity log.

These tests mock the DB at the dependency layer so they're fast and don't
require Postgres. For routes that execute multiple sequential queries we
program `db.execute` with a side_effect list.
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from backend.auth import get_current_user
from backend.database import get_db
from backend.main import app


def _mock_user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = "agent@strata.app"
    user.strategy_settings = {"agentName": "Jane Agent", "brokerageName": "Strata Realty"}
    return user


def _mock_client(user_id: uuid.UUID, name: str = "Bob Client"):
    c = MagicMock()
    c.id = uuid.uuid4()
    c.user_id = user_id
    c.name = name
    return c


def _mock_portal(agent_user_id: uuid.UUID, client_id: uuid.UUID, property_ids: list[str] | None = None):
    p = MagicMock()
    p.id = uuid.uuid4()
    p.agent_user_id = agent_user_id
    p.client_id = client_id
    p.name = "Bob's Properties"
    p.magic_link_token = uuid.uuid4()
    p.property_ids = property_ids or []
    p.status = "active"
    p.created_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
    p.updated_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
    return p


def _execute_returning(results_in_order):
    """Build a mock db.execute that returns each result in sequence. Each
    entry should be a MagicMock shaped like SQLAlchemy's Result."""
    iterator = iter(results_in_order)

    async def execute(*_args, **_kwargs):
        try:
            return next(iterator)
        except StopIteration:
            # Fall back to an empty result rather than crashing — some routes
            # issue a final bookkeeping query we haven't prescribed.
            empty = MagicMock()
            empty.scalar_one_or_none.return_value = None
            empty.scalars.return_value.all.return_value = []
            empty.all.return_value = []
            return empty

    return AsyncMock(side_effect=execute)


def _result_for(scalar=None, scalars_all=None, all_=None):
    r = MagicMock()
    r.scalar_one_or_none.return_value = scalar
    r.scalars.return_value.all.return_value = scalars_all or []
    r.all.return_value = all_ or []
    return r


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ── Auth guard ────────────────────────────────────────────────────────────────

async def test_create_portal_requires_auth(client):
    resp = await client.post("/client-portals", json={"clientId": str(uuid.uuid4()), "propertyIds": []})
    assert resp.status_code == 401


async def test_list_portals_requires_auth(client):
    resp = await client.get("/client-portals")
    assert resp.status_code == 401


# ── Create ────────────────────────────────────────────────────────────────────

async def test_create_portal_success(client):
    user = _mock_user()
    client_row = _mock_client(user.id, name="Bob")

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=client_row)])
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()
    mock_db.delete = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            "/client-portals",
            json={"clientId": str(client_row.id), "propertyIds": ["p1", "p2"]},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["name"] == "Bob's Properties"
        assert body["propertyCount"] == 2
        assert body["clientId"] == str(client_row.id)
        assert body["status"] == "active"
        assert body["shareUrl"].startswith("/portal/")
        mock_db.add.assert_called_once()
    finally:
        app.dependency_overrides.clear()


async def test_create_portal_404_when_client_belongs_to_other_user(client):
    user = _mock_user()
    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=None)])
    mock_db.flush = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            "/client-portals",
            json={"clientId": str(uuid.uuid4()), "propertyIds": []},
        )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


async def test_create_portal_validates_client_id(client):
    user = _mock_user()

    async def fake_db():
        yield AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post("/client-portals", json={"clientId": "not-a-uuid", "propertyIds": []})
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.clear()


# ── List ──────────────────────────────────────────────────────────────────────

async def test_list_portals_returns_summaries_with_client_name(client):
    user = _mock_user()
    client_row = _mock_client(user.id, name="Bob")
    portal = _mock_portal(user.id, client_row.id, property_ids=["p1"])

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([
        _result_for(scalars_all=[portal]),
        _result_for(scalars_all=[client_row]),
        _result_for(all_=[(portal.id, datetime(2026, 4, 20, tzinfo=timezone.utc))]),
    ])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get("/client-portals")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert len(data) == 1
        assert data[0]["clientName"] == "Bob"
        assert data[0]["propertyCount"] == 1
        assert data[0]["lastClientActivityAt"].startswith("2026-04-20")
    finally:
        app.dependency_overrides.clear()


# ── Public view (no auth) ─────────────────────────────────────────────────────

async def test_public_view_returns_portal_with_agent_profile(client):
    user = _mock_user()
    portal = _mock_portal(user.id, uuid.uuid4(), property_ids=["p1"])

    mock_db = AsyncMock()
    # view_portal calls: portal_by_token, then select User(agent)
    mock_db.execute = _execute_returning([
        _result_for(scalar=portal),
        _result_for(scalar=user),
    ])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get(f"/client-portals/view/{portal.magic_link_token}")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["portalName"] == portal.name
        assert body["agent"]["name"] == "Jane Agent"
        assert body["agent"]["brokerage"] == "Strata Realty"
        # p1 is in MOCK_PROPERTIES so address should hydrate
        assert body["properties"][0]["id"] == "p1"
        assert "Oak Creek" in body["properties"][0]["address"]
    finally:
        app.dependency_overrides.clear()


async def test_public_view_404_on_bad_token(client):
    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=None)])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get(f"/client-portals/view/{uuid.uuid4()}")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


# ── Public activity log (no auth) ─────────────────────────────────────────────

async def test_public_activity_records_favorite_and_mirrors_to_client_activity(client):
    user = _mock_user()
    portal = _mock_portal(user.id, uuid.uuid4())

    mock_db = AsyncMock()
    # _portal_by_token lookup, then ClientActivity upsert lookup (none exists)
    mock_db.execute = _execute_returning([
        _result_for(scalar=portal),
        _result_for(scalar=None),
    ])
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            f"/client-portals/view/{portal.magic_link_token}/activity",
            json={"propertyId": "p1", "actionType": "favorited", "clientName": "Bob"},
        )
        assert resp.status_code == 201
        # One add for ClientPortalActivity, one for mirrored ClientActivity
        assert mock_db.add.call_count == 2
    finally:
        app.dependency_overrides.clear()


async def test_public_activity_rejects_unknown_action(client):
    portal = _mock_portal(uuid.uuid4(), uuid.uuid4())

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=portal)])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            f"/client-portals/view/{portal.magic_link_token}/activity",
            json={"actionType": "teleported"},
        )
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.clear()


async def test_public_activity_unfavorite_does_not_mirror(client):
    user = _mock_user()
    portal = _mock_portal(user.id, uuid.uuid4())

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=portal)])
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            f"/client-portals/view/{portal.magic_link_token}/activity",
            json={"propertyId": "p1", "actionType": "unfavorited"},
        )
        assert resp.status_code == 201
        # Only the portal activity row — no mirror
        assert mock_db.add.call_count == 1
    finally:
        app.dependency_overrides.clear()


# ── Leads: DELETE /activity/remove ────────────────────────────────────────────

async def test_remove_activity_deletes_row_when_present(client):
    user = _mock_user()
    existing = MagicMock()
    existing.count = 2

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=existing)])
    mock_db.delete = AsyncMock()
    mock_db.flush = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            "/activity/remove",
            json={"property_id": "p1", "activity_type": "saved"},
        )
        assert resp.status_code == 204
        mock_db.delete.assert_awaited_once_with(existing)
    finally:
        app.dependency_overrides.clear()


async def test_remove_activity_is_noop_when_absent(client):
    user = _mock_user()
    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=None)])
    mock_db.delete = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            "/activity/remove",
            json={"property_id": "p1", "activity_type": "saved"},
        )
        assert resp.status_code == 204
        mock_db.delete.assert_not_called()
    finally:
        app.dependency_overrides.clear()
