"""
Tests for /properties endpoints using mock data fallback.
Mock IDs (p1, p2…) bypass DB (not valid UUIDs) and use MOCK_PROPERTIES directly.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.database import get_db

_FLOOD = {"zone": "X", "in_sfha": False, "risk_label": "Low Risk", "description": "Minimal"}
_SCHOOLS: list = []
_RENT = {"rent_low": 1800, "rent_mid": 2000, "rent_high": 2200, "confidence": "Low", "source": "Estimate"}


def _make_db_override():
    """Return a FastAPI dependency override that yields a minimal async mock DB session."""
    async def fake_db():
        mock = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        result.scalar.return_value = None
        result.scalars.return_value.all.return_value = []
        mock.execute = AsyncMock(return_value=result)
        yield mock
    return fake_db


@pytest.fixture(autouse=True)
def patch_deps():
    app.dependency_overrides[get_db] = _make_db_override()
    with patch("backend.routers.properties.risk_service.get_flood_zone", new_callable=AsyncMock, return_value=_FLOOD):
        with patch("backend.routers.properties.get_nearby_schools", new_callable=AsyncMock, return_value=_SCHOOLS):
            with patch("backend.routers.properties.get_rent_estimate", new_callable=AsyncMock, return_value=_RENT):
                yield
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def test_search_returns_list(client):
    resp = await client.get("/properties/search")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


async def test_search_filter_min_deal_score(client):
    resp = await client.get("/properties/search?min_deal_score=80")
    assert resp.status_code == 200
    for prop in resp.json():
        assert prop["dealScore"] >= 80


async def test_search_filter_max_price(client):
    resp = await client.get("/properties/search?max_price=300000")
    assert resp.status_code == 200
    for prop in resp.json():
        assert prop["price"] <= 300000


async def test_search_sort_by_deal_score(client):
    resp = await client.get("/properties/search?sort_by=Deal+Score")
    assert resp.status_code == 200
    scores = [p["dealScore"] for p in resp.json()]
    assert scores == sorted(scores, reverse=True)


async def test_get_property_p1(client):
    resp = await client.get("/properties/p1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "p1"
    assert data["address"] == "4521 Oak Creek Drive"
    assert data["dealScore"] == 81


async def test_get_property_required_fields(client):
    resp = await client.get("/properties/p1")
    assert resp.status_code == 200
    data = resp.json()
    for field in ["id", "address", "price", "beds", "baths", "sqft", "dealScore", "capRate", "cashFlow"]:
        assert field in data


async def test_get_property_404(client):
    resp = await client.get("/properties/does-not-exist")
    assert resp.status_code == 404


async def test_get_property_attaches_flood_risk(client):
    resp = await client.get("/properties/p1")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("floodRisk") is not None
    assert data["floodRisk"]["zone"] == "X"


async def test_get_valuation(client):
    resp = await client.get("/properties/p1/valuation")
    assert resp.status_code == 200
    data = resp.json()
    assert "fairValueMid" in data
    assert "propertyId" in data


async def test_get_risk(client):
    resp = await client.get("/properties/p1/risk")
    assert resp.status_code == 200
    data = resp.json()
    assert "compositeScore" in data
    assert isinstance(data["dimensions"], list)
    assert len(data["dimensions"]) > 0


async def test_get_comps(client):
    resp = await client.get("/properties/p1/comps")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
