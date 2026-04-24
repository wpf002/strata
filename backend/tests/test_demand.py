"""Tests for the demand signal endpoints — score calibration, narrative note,
bulk shape, zero-activity edge cases.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from backend.database import get_db
from backend.main import app


def _mock_db_with_rows(rows):
    """Build an AsyncMock DB whose execute() returns a Result whose .all()
    yields the supplied (property_id, user_id, activity_type) tuples."""
    mock_db = AsyncMock()
    result = MagicMock()
    result.all.return_value = rows
    mock_db.execute = AsyncMock(return_value=result)
    return mock_db


def _now():
    return datetime.now(timezone.utc)


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ── Single-property /demand ──────────────────────────────────────────────────

async def test_demand_signal_zero_activity_returns_low_label(client):
    mock_db = _mock_db_with_rows([])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get("/properties/p1/demand")
        assert resp.status_code == 200
        body = resp.json()
        assert body["propertyId"] == "p1"
        assert body["demandScore"] == 0
        assert "Low" in body["demandLabel"]
        assert body["strataViews30d"] == 0
        assert body["strataSaves30d"] == 0
        assert body["strataUnderwrites30d"] == 0
        assert "No investor activity yet" in body["note"]
        # p1 is in MOCK_PROPERTIES; city is Dallas (DOM 23 vs market 28 → on pace)
        assert body["daysOnMarket"] == 23
    finally:
        app.dependency_overrides.clear()


async def test_demand_signal_high_activity_scores_high(client):
    # 4 underwrites (weight 5 × 4 = 20) + 3 saves (3 × 3 = 9) → raw 29 → score 100 → "High"
    # Use distinct user_ids so the distinct-count logic counts them all.
    rows = []
    for i in range(4):
        rows.append(("p1", uuid.uuid4(), "underwritten"))
    for i in range(3):
        rows.append(("p1", uuid.uuid4(), "saved"))

    # Note: the single-property endpoint queries with a property_id filter, so
    # the mock just needs to return these rows as (user_id, activity_type) pairs.
    # _distinct_counts_by_type selects (user_id, activity_type) — strip property_id.
    pairs = [(r[1], r[2]) for r in rows]

    mock_db = _mock_db_with_rows(pairs)

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get("/properties/p1/demand")
        assert resp.status_code == 200
        body = resp.json()
        assert body["demandScore"] >= 70
        assert "High" in body["demandLabel"]
        assert body["strataUnderwrites30d"] == 4
        assert body["strataSaves30d"] == 3
        assert "4 investors ran underwriting" in body["note"]
    finally:
        app.dependency_overrides.clear()


async def test_demand_signal_distinct_users_not_rows(client):
    """Same user with 3 views should count as 1 distinct viewer."""
    same_user = uuid.uuid4()
    pairs = [(same_user, "viewed")] * 3 + [(same_user, "saved")]

    mock_db = _mock_db_with_rows(pairs)

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get("/properties/p1/demand")
        assert resp.status_code == 200
        body = resp.json()
        assert body["strataViews30d"] == 1
        assert body["strataSaves30d"] == 1
    finally:
        app.dependency_overrides.clear()


# ── Batch /demand-signals ────────────────────────────────────────────────────

async def test_demand_signals_batch_returns_all_requested_ids(client):
    """Missing ids should still appear with zero score — keeps the frontend
    simple (no need to handle partial maps)."""
    mock_db = _mock_db_with_rows([])

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get("/properties/demand-signals?ids=p1,p2,p3")
        assert resp.status_code == 200
        body = resp.json()
        assert set(body.keys()) == {"p1", "p2", "p3"}
        for pid in ["p1", "p2", "p3"]:
            assert body[pid]["demandScore"] == 0
            assert "Low" in body[pid]["demandLabel"]
    finally:
        app.dependency_overrides.clear()


async def test_demand_signals_batch_aggregates_per_property(client):
    u1, u2, u3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    # p1 gets 5 saves (weight 3 × 5 = 15 → score 60 → Medium)
    # p2 gets 1 view (weight 1 × 1 = 1 → score 4 → Low)
    rows = [
        ("p1", u1, "saved"),
        ("p1", u2, "saved"),
        ("p1", u3, "saved"),
        ("p1", uuid.uuid4(), "saved"),
        ("p1", uuid.uuid4(), "saved"),
        ("p2", u1, "viewed"),
    ]
    mock_db = _mock_db_with_rows(rows)

    async def fake_db():
        yield mock_db

    app.dependency_overrides[get_db] = fake_db
    try:
        resp = await client.get("/properties/demand-signals?ids=p1,p2")
        assert resp.status_code == 200
        body = resp.json()
        assert body["p1"]["demandScore"] >= 35  # Medium or higher
        assert body["p2"]["demandScore"] < 35   # Low
    finally:
        app.dependency_overrides.clear()
