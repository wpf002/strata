"""Tests for copilot conversation persistence — create, list, get, delete."""
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


def _mock_conv(user_id: uuid.UUID, messages=None, title="How should I price my offer?"):
    c = MagicMock()
    c.id = uuid.uuid4()
    c.user_id = user_id
    c.property_id = "p1"
    c.title = title
    c.messages = messages if messages is not None else [
        {"role": "user", "content": "How should I price my offer?"},
        {"role": "assistant", "content": "Based on the comps…"},
    ]
    c.created_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
    c.updated_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
    return c


def _execute_returning(results):
    it = iter(results)

    async def execute(*_a, **_k):
        try:
            return next(it)
        except StopIteration:
            r = MagicMock()
            r.scalar_one_or_none.return_value = None
            r.scalars.return_value.all.return_value = []
            return r

    return AsyncMock(side_effect=execute)


def _result_for(scalar=None, scalars_all=None):
    r = MagicMock()
    r.scalar_one_or_none.return_value = scalar
    r.scalars.return_value.all.return_value = scalars_all or []
    return r


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ── Save (create) ────────────────────────────────────────────────────────────

async def test_save_conversation_creates_new_row_and_derives_title(client):
    user = _mock_user()
    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([])
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            "/copilot/conversations",
            json={
                "propertyId": "p1",
                "messages": [
                    {"role": "user", "content": "What's the best offer strategy for this Dallas SFR?"},
                    {"role": "assistant", "content": "Given the DOM and comps…"},
                ],
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["title"].startswith("What's the best offer strategy")
        assert body["propertyId"] == "p1"
        assert len(body["messages"]) == 2
        mock_db.add.assert_called_once()
    finally:
        app.dependency_overrides.clear()


async def test_save_conversation_updates_existing(client):
    user = _mock_user()
    existing = _mock_conv(user.id)
    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=existing)])
    mock_db.flush = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            "/copilot/conversations",
            json={
                "id": str(existing.id),
                "propertyId": "p2",
                "messages": [{"role": "user", "content": "New question"}],
            },
        )
        assert resp.status_code == 200, resp.text
        assert existing.property_id == "p2"
        assert existing.title == "New question"
    finally:
        app.dependency_overrides.clear()


async def test_save_conversation_404_when_updating_other_users_conv(client):
    user = _mock_user()
    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=None)])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            "/copilot/conversations",
            json={
                "id": str(uuid.uuid4()),
                "messages": [{"role": "user", "content": "Hi"}],
            },
        )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


# ── List ─────────────────────────────────────────────────────────────────────

async def test_list_conversations_returns_summaries(client):
    user = _mock_user()
    c1 = _mock_conv(user.id, title="First")
    c2 = _mock_conv(user.id, title="Second")
    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalars_all=[c1, c2])])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get("/copilot/conversations")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        # Summary shape has messageCount, not full messages, to keep the sidebar cheap
        assert "messageCount" in data[0]
        assert "messages" not in data[0]
    finally:
        app.dependency_overrides.clear()


# ── Get ──────────────────────────────────────────────────────────────────────

async def test_get_conversation_returns_full_messages(client):
    user = _mock_user()
    c = _mock_conv(user.id)
    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=c)])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get(f"/copilot/conversations/{c.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == str(c.id)
        assert len(body["messages"]) == 2
    finally:
        app.dependency_overrides.clear()


async def test_get_conversation_404_when_not_owned(client):
    user = _mock_user()
    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=None)])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get(f"/copilot/conversations/{uuid.uuid4()}")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


# ── Delete ───────────────────────────────────────────────────────────────────

async def test_delete_conversation_when_owned(client):
    user = _mock_user()
    c = _mock_conv(user.id)
    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=c)])
    mock_db.delete = AsyncMock()
    mock_db.flush = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.delete(f"/copilot/conversations/{c.id}")
        assert resp.status_code == 204
        mock_db.delete.assert_awaited_once_with(c)
    finally:
        app.dependency_overrides.clear()


# ── Auth ─────────────────────────────────────────────────────────────────────

async def test_list_conversations_requires_auth(client):
    resp = await client.get("/copilot/conversations")
    assert resp.status_code == 401
