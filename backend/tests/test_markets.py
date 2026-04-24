"""
Tests for the supported-markets registry and the /markets/supported endpoint.
"""
import pytest
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.services import markets_service


def test_load_markets_has_expected_count():
    markets = markets_service.load_markets()
    # 5 launch + 20 additional = 25 total
    assert len(markets) >= 25


def test_launch_markets_flagged():
    markets = markets_service.load_markets()
    launch = [m for m in markets.values() if m.get("is_launch_market")]
    assert len(launch) == 5
    cities = {m["city"] for m in launch}
    assert {"Dallas", "Phoenix", "Nashville", "Atlanta", "Tampa"}.issubset(cities)


def test_list_markets_puts_launch_markets_first():
    listed = markets_service.list_markets()
    # First 5 entries must all be launch markets
    for m in listed[:5]:
        assert m["isLaunchMarket"] is True


def test_resolve_market_exact_id():
    m = markets_service.resolve_market("phoenix-az")
    assert m is not None
    assert m["city"] == "Phoenix"
    assert m["state_code"] == "AZ"


def test_resolve_market_from_query():
    m = markets_service.resolve_market("Nashville, TN")
    assert m is not None
    assert m["city"] == "Nashville"


def test_resolve_market_case_insensitive():
    assert markets_service.resolve_market("atlanta ga") is not None
    assert markets_service.resolve_market("TAMPA FL") is not None


def test_resolve_market_city_only_fallback():
    # City alone should still resolve when uniquely matching
    m = markets_service.resolve_market("Charlotte")
    assert m is not None
    assert m["state_code"] == "NC"


def test_resolve_market_unknown_returns_none():
    assert markets_service.resolve_market("Timbuktu XX") is None
    assert markets_service.resolve_market("") is None
    assert markets_service.resolve_market(None) is None


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def test_supported_markets_endpoint_returns_list(client):
    resp = await client.get("/markets/supported")
    assert resp.status_code == 200
    data = resp.json()
    assert "markets" in data
    assert isinstance(data["markets"], list)
    assert len(data["markets"]) >= 25


async def test_supported_markets_shape(client):
    resp = await client.get("/markets/supported")
    markets = resp.json()["markets"]
    first = markets[0]
    for field in ("marketId", "city", "state", "stateCode", "isLaunchMarket"):
        assert field in first, f"missing {field} in {first}"
