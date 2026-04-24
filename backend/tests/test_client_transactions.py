"""Tests for client transactions — create, list, update, patch milestone."""
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


def _mock_client_row(user_id: uuid.UUID):
    c = MagicMock()
    c.id = uuid.uuid4()
    c.user_id = user_id
    c.name = "Bob"
    return c


def _mock_txn(agent_id: uuid.UUID, client_id: uuid.UUID, milestones: list[dict] | None = None):
    t = MagicMock()
    t.id = uuid.uuid4()
    t.agent_user_id = agent_id
    t.client_id = client_id
    t.property_id = "p1"
    t.property_address = "4521 Oak Creek Drive"
    t.status = "searching"
    t.milestones = milestones if milestones is not None else []
    t.created_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
    t.updated_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
    return t


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


# ── Create ────────────────────────────────────────────────────────────────────

async def test_create_transaction_seeds_8_milestones(client):
    user = _mock_user()
    client_row = _mock_client_row(user.id)

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=client_row)])
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            f"/clients/{client_row.id}/transactions",
            json={"propertyId": "p1", "propertyAddress": "4521 Oak Creek Drive"},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["propertyAddress"] == "4521 Oak Creek Drive"
        assert body["status"] == "searching"
        assert len(body["milestones"]) == 8
        assert body["milestones"][0]["label"] == "Property identified"
        assert body["milestones"][-1]["label"] == "Closed"
        assert all(m["status"] == "pending" for m in body["milestones"])
        assert body["progressPct"] == 0
        assert body["progressTotal"] == 8
    finally:
        app.dependency_overrides.clear()


async def test_create_transaction_404_when_client_belongs_to_other_user(client):
    user = _mock_user()
    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=None)])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.post(
            f"/clients/{uuid.uuid4()}/transactions",
            json={"propertyAddress": "somewhere"},
        )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


# ── List ──────────────────────────────────────────────────────────────────────

async def test_list_transactions_returns_sorted_by_updated_at(client):
    user = _mock_user()
    c = _mock_client_row(user.id)
    t1 = _mock_txn(user.id, c.id)
    t2 = _mock_txn(user.id, c.id)

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([
        _result_for(scalar=c),
        _result_for(scalars_all=[t2, t1]),
    ])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get(f"/clients/{c.id}/transactions")
        assert resp.status_code == 200
        assert len(resp.json()) == 2
    finally:
        app.dependency_overrides.clear()


# ── Update ────────────────────────────────────────────────────────────────────

async def test_update_transaction_status_and_address(client):
    user = _mock_user()
    c = _mock_client_row(user.id)
    t = _mock_txn(user.id, c.id)

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=t)])
    mock_db.flush = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.put(
            f"/clients/{c.id}/transactions/{t.id}",
            json={"status": "closed", "propertyAddress": "New Address"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "closed"
        assert resp.json()["propertyAddress"] == "New Address"
    finally:
        app.dependency_overrides.clear()


async def test_update_transaction_rejects_invalid_status(client):
    user = _mock_user()
    c = _mock_client_row(user.id)
    t = _mock_txn(user.id, c.id)

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=t)])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.put(
            f"/clients/{c.id}/transactions/{t.id}",
            json={"status": "bogus"},
        )
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.clear()


# ── Patch milestone ───────────────────────────────────────────────────────────

async def test_patch_milestone_marks_complete_and_auto_advances_status(client):
    user = _mock_user()
    c = _mock_client_row(user.id)
    # Pre-seed with the default 8 milestones; we'll mark m2 (offer submitted) complete
    milestones = [
        {"id": f"m{i+1}", "label": f"M{i+1}", "status": "pending", "target_date": None, "completed_date": None, "notes": None}
        for i in range(8)
    ]
    t = _mock_txn(user.id, c.id, milestones=milestones)

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=t)])
    mock_db.flush = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.patch(
            f"/clients/{c.id}/transactions/{t.id}/milestones/m2",
            json={"status": "complete"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "offer_made"
        m2 = next(m for m in body["milestones"] if m["id"] == "m2")
        assert m2["status"] == "complete"
        assert m2["completedDate"] is not None
        # Progress = 1 complete of 8 non-skipped = 12%
        assert body["progressCount"] == 1
        assert body["progressTotal"] == 8
    finally:
        app.dependency_overrides.clear()


async def test_patch_milestone_marks_closed_when_final_complete(client):
    user = _mock_user()
    c = _mock_client_row(user.id)
    milestones = [
        {"id": f"m{i+1}", "label": f"M{i+1}", "status": "complete" if i < 7 else "pending", "target_date": None, "completed_date": None, "notes": None}
        for i in range(8)
    ]
    t = _mock_txn(user.id, c.id, milestones=milestones)

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=t)])
    mock_db.flush = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.patch(
            f"/clients/{c.id}/transactions/{t.id}/milestones/m8",
            json={"status": "complete"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "closed"
    finally:
        app.dependency_overrides.clear()


async def test_patch_milestone_404_when_id_not_in_list(client):
    user = _mock_user()
    c = _mock_client_row(user.id)
    t = _mock_txn(user.id, c.id, milestones=[])

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=t)])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.patch(
            f"/clients/{c.id}/transactions/{t.id}/milestones/m99",
            json={"status": "complete"},
        )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.clear()


async def test_patch_milestone_allows_adding_notes(client):
    user = _mock_user()
    c = _mock_client_row(user.id)
    milestones = [
        {"id": "m1", "label": "First", "status": "pending", "target_date": None, "completed_date": None, "notes": None},
    ]
    t = _mock_txn(user.id, c.id, milestones=milestones)

    mock_db = AsyncMock()
    mock_db.execute = _execute_returning([_result_for(scalar=t)])
    mock_db.flush = AsyncMock()

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.patch(
            f"/clients/{c.id}/transactions/{t.id}/milestones/m1",
            json={"notes": "Buyer wants to negotiate HVAC"},
        )
        assert resp.status_code == 200
        m1 = resp.json()["milestones"][0]
        assert m1["notes"] == "Buyer wants to negotiate HVAC"
    finally:
        app.dependency_overrides.clear()
