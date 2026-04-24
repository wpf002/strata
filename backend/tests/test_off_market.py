"""
Tests for off-market signal detection and the /properties/{id}/off-market-signals
endpoint.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.database import get_db
from backend.services import off_market_service


# ── Unit tests for the signal computation ────────────────────────────────────

def test_no_signals_for_fresh_listing():
    prop = {
        "days_on_market": 14,
        "price": 300000,
        "fair_value_low": 290000,
        "fair_value_high": 310000,
        "type": "Single Family",
    }
    result = off_market_service.compute_signals(prop)
    assert result["has_signals"] is False
    assert result["signals"] == []
    assert result["motivation_score"] == 0


def test_extended_listing_triggers_signal():
    prop = {"days_on_market": 120, "price": 300000}
    result = off_market_service.compute_signals(prop)
    types = [s["type"] for s in result["signals"]]
    assert "extended_listing" in types
    assert result["motivation_score"] >= 15


def test_price_reductions_two_plus_are_high_severity():
    prop = {"days_on_market": 40, "price": 300000, "price_reductions": 2}
    result = off_market_service.compute_signals(prop)
    hits = [s for s in result["signals"] if s["type"] == "multiple_price_reductions"]
    assert hits and hits[0]["severity"] == "high"


def test_assessment_gap_below_threshold():
    prop = {
        "days_on_market": 30, "price": 400000,
        "assessed_value": 200000,  # 50% of list
    }
    result = off_market_service.compute_signals(prop)
    types = [s["type"] for s in result["signals"]]
    assert "assessment_gap" in types


def test_dom_outlier_requires_zip_median():
    prop = {"days_on_market": 80, "price": 300000}
    no_median = off_market_service.compute_signals(prop)
    with_median = off_market_service.compute_signals(prop, zip_median_dom=30.0)
    assert "dom_outlier" not in [s["type"] for s in no_median["signals"]]
    assert "dom_outlier" in [s["type"] for s in with_median["signals"]]


def test_motivation_score_capped_at_100():
    prop = {
        "days_on_market": 200, "price": 400000,
        "price_reductions": 5, "has_price_reduction": True,
        "assessed_value": 100000, "fair_value_mid": 600000,
    }
    result = off_market_service.compute_signals(prop, zip_median_dom=30.0)
    assert result["motivation_score"] <= 100


def test_below_fair_value_high_severity():
    prop = {
        "days_on_market": 30, "price": 200000,
        "fair_value_low": 280000, "fair_value_high": 320000,
    }
    result = off_market_service.compute_signals(prop)
    hits = [s for s in result["signals"] if s["type"] == "below_value"]
    assert hits and hits[0]["severity"] == "high"


def test_absentee_owner_sfr_only():
    # SFR with differing owner address → signal
    sfr = {
        "type": "Single Family",
        "address": "123 Main St",
        "owner_address": "456 Elsewhere Ave",
        "days_on_market": 20,
        "price": 300000,
    }
    result = off_market_service.compute_signals(sfr)
    assert "absentee_owner" in [s["type"] for s in result["signals"]]

    # Condo with same data → no absentee signal (heuristic is SFR-only)
    condo = {**sfr, "type": "Condo"}
    result = off_market_service.compute_signals(condo)
    assert "absentee_owner" not in [s["type"] for s in result["signals"]]


# ── Endpoint tests ────────────────────────────────────────────────────────────

@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture(autouse=True)
def override_db():
    async def fake_db():
        mock = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        mock.execute = AsyncMock(return_value=result)
        yield mock
    app.dependency_overrides[get_db] = fake_db
    yield
    app.dependency_overrides.pop(get_db, None)


async def test_off_market_signals_endpoint_returns_shape(client):
    resp = await client.get("/properties/p3/off-market-signals")
    assert resp.status_code == 200
    data = resp.json()
    assert "has_signals" in data
    assert "signals" in data
    assert "motivation_score" in data


async def test_off_market_endpoint_404_for_unknown(client):
    resp = await client.get("/properties/not-a-real-id/off-market-signals")
    assert resp.status_code == 404


async def test_search_off_market_only_filter(client):
    # The patched mocks in p3/p6 have strong signals; off_market_only=true
    # should return only those with motivation_score >= 30.
    with patch("backend.routers.properties.risk_service.get_flood_zone", new_callable=AsyncMock, return_value={}):
        with patch("backend.routers.properties.get_nearby_schools", new_callable=AsyncMock, return_value=[]):
            with patch("backend.routers.properties.get_rent_estimate", new_callable=AsyncMock, return_value={}):
                resp = await client.get("/properties/search?off_market_only=true")
                assert resp.status_code == 200
                results = resp.json()
                for p in results:
                    assert (p.get("motivationScore") or 0) >= 30


async def test_search_without_off_market_returns_all(client):
    with patch("backend.routers.properties.risk_service.get_flood_zone", new_callable=AsyncMock, return_value={}):
        with patch("backend.routers.properties.get_nearby_schools", new_callable=AsyncMock, return_value=[]):
            with patch("backend.routers.properties.get_rent_estimate", new_callable=AsyncMock, return_value={}):
                resp = await client.get("/properties/search")
                assert resp.status_code == 200
                assert len(resp.json()) >= 1
