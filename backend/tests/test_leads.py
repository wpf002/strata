"""
Tests for the Leads router — POST /activity and GET /leads.
Auth and DB are overridden via app.dependency_overrides.
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
    return user


def _mock_db(existing=None):
    mock_db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = existing
    result.scalars.return_value.all.return_value = existing if isinstance(existing, list) else []
    mock_db.execute = AsyncMock(return_value=result)
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()
    return mock_db


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ── POST /activity ────────────────────────────────────────────────────────────

async def test_record_activity_new_row(client):
    user = _mock_user()
    mock_db = _mock_db(existing=None)

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            "/activity",
            json={"property_id": "p1", "activity_type": "viewed"},
        )
        assert resp.status_code == 201
        assert resp.json()["count"] == 1
        mock_db.add.assert_called_once()
    finally:
        app.dependency_overrides.clear()


async def test_record_activity_increments_existing(client):
    user = _mock_user()
    existing = MagicMock()
    existing.count = 3
    existing.last_occurred_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    existing.activity_metadata = None
    mock_db = _mock_db(existing=existing)

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            "/activity",
            json={"property_id": "p1", "activity_type": "viewed"},
        )
        assert resp.status_code == 201
        assert resp.json()["count"] == 4
        mock_db.add.assert_not_called()
    finally:
        app.dependency_overrides.clear()


async def test_record_activity_rejects_invalid_type(client):
    user = _mock_user()
    mock_db = _mock_db()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            "/activity",
            json={"property_id": "p1", "activity_type": "teleported"},
        )
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.clear()


async def test_record_activity_requires_auth(client):
    resp = await client.post(
        "/activity",
        json={"property_id": "p1", "activity_type": "viewed"},
    )
    assert resp.status_code == 401


# ── GET /leads ────────────────────────────────────────────────────────────────

async def test_list_leads_empty(client):
    user = _mock_user()
    mock_db = _mock_db(existing=[])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get("/leads")
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        app.dependency_overrides.clear()


async def test_list_leads_groups_and_scores(client):
    user = _mock_user()
    row_viewed = MagicMock(
        property_id="p1", activity_type="viewed",
        count=3, last_occurred_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
    )
    row_underwritten = MagicMock(
        property_id="p1", activity_type="underwritten",
        count=1, last_occurred_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
    )
    row_other = MagicMock(
        property_id="p2", activity_type="saved",
        count=2, last_occurred_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
    )
    mock_db = _mock_db(existing=[row_viewed, row_underwritten, row_other])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get("/leads")
        assert resp.status_code == 200
        leads = resp.json()
        assert len(leads) == 2

        # p1 scores (1*3) + (5*1) = 8; p2 scores 3*2 = 6 → p1 sorted first
        assert leads[0]["propertyId"] == "p1"
        assert leads[0]["engagementScore"] == 8
        assert leads[0]["activities"]["viewed"]["count"] == 3
        assert leads[0]["activities"]["underwritten"]["count"] == 1
        assert leads[0]["lastActive"].startswith("2026-04-01")

        assert leads[1]["propertyId"] == "p2"
        assert leads[1]["engagementScore"] == 6
    finally:
        app.dependency_overrides.clear()
