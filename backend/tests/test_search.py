"""
Tests for saved searches and watchlist CRUD endpoints.
Auth and DB are overridden via app.dependency_overrides.
"""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.auth import get_current_user
from backend.database import get_db


def _mock_user():
    user = MagicMock()
    user.id = uuid.uuid4()
    return user


def _make_mock_db(rows=None):
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = rows or []
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=mock_result)
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()
    return mock_db


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ── Saved Searches ────────────────────────────────────────────────────────────

async def test_list_saved_searches_empty(client):
    user = _mock_user()
    mock_db = _make_mock_db([])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get("/saved-searches")
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        app.dependency_overrides.clear()


async def test_create_saved_search(client):
    user = _mock_user()
    search = MagicMock()
    search.id = str(uuid.uuid4())
    search.name = "Dallas LTR"
    search.criteria = {}
    search.alert_enabled = False
    search.last_notified_property_ids = []
    mock_db = _make_mock_db()

    async def fake_db():
        yield mock_db

    from backend.routers import search as search_router
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    original_class = search_router.SavedSearch
    search_router.SavedSearch = MagicMock(return_value=search)
    try:
        resp = await client.post(
            "/saved-searches",
            json={"name": "Dallas LTR", "criteria": {}, "alert_enabled": False},
        )
        assert resp.status_code == 201
    finally:
        app.dependency_overrides.clear()
        search_router.SavedSearch = original_class


async def test_delete_saved_search_not_found(client):
    user = _mock_user()
    mock_db = _make_mock_db()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.delete(f"/saved-searches/{uuid.uuid4()}")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


# ── Watchlists ────────────────────────────────────────────────────────────────

async def test_list_watchlists_empty(client):
    user = _mock_user()
    mock_db = _make_mock_db([])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get("/watchlists")
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        app.dependency_overrides.clear()


async def test_create_watchlist(client):
    user = _mock_user()
    wl = MagicMock()
    wl.id = str(uuid.uuid4())
    wl.name = "My Watchlist"
    wl.property_ids = []
    mock_db = _make_mock_db()

    async def fake_db():
        yield mock_db

    from backend.routers import search as search_router
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    original_class = search_router.Watchlist
    search_router.Watchlist = MagicMock(return_value=wl)
    try:
        resp = await client.post("/watchlists", json={"name": "My Watchlist"})
        assert resp.status_code == 201
    finally:
        app.dependency_overrides.clear()
        search_router.Watchlist = original_class
