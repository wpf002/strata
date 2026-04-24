"""
Tests for renovation cost estimation and the /properties/{id}/renovation-estimate
endpoint.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.database import get_db
from backend.services import renovation_service


# ── Unit tests for the cost engine ────────────────────────────────────────────

def test_cosmetic_scales_with_sqft():
    small = renovation_service.compute_estimate(
        scope=['cosmetic'], condition='average', sqft=1000,
        property_type='Single Family', state='TX',
    )
    large = renovation_service.compute_estimate(
        scope=['cosmetic'], condition='average', sqft=3000,
        property_type='Single Family', state='TX',
    )
    assert large['subtotal_low'] > small['subtotal_low']
    assert large['subtotal_high'] > small['subtotal_high']
    # Roughly linear — 3x sqft gives ~3x cost (allow ±10%)
    ratio = large['subtotal_low'] / small['subtotal_low']
    assert 2.7 <= ratio <= 3.3


def test_bathroom_scales_with_baths():
    one_bath = renovation_service.compute_estimate(
        scope=['bathrooms'], condition='average', sqft=1500,
        property_type='Single Family', state='TX', baths=1,
    )
    three_bath = renovation_service.compute_estimate(
        scope=['bathrooms'], condition='average', sqft=1500,
        property_type='Single Family', state='TX', baths=3,
    )
    assert three_bath['subtotal_low'] == 3 * one_bath['subtotal_low']


def test_state_multiplier_applied():
    tx = renovation_service.compute_estimate(
        scope=['kitchen'], condition='average', sqft=1500,
        property_type='Single Family', state='TX',
    )
    ca = renovation_service.compute_estimate(
        scope=['kitchen'], condition='average', sqft=1500,
        property_type='Single Family', state='CA',
    )
    # CA is 1.40, TX is 0.95 → CA should be noticeably higher
    assert ca['subtotal_low'] > tx['subtotal_low'] * 1.4 * 0.99


def test_condition_multiplier_applied():
    poor = renovation_service.compute_estimate(
        scope=['kitchen'], condition='poor', sqft=1500,
        property_type='Single Family', state='TX',
    )
    good = renovation_service.compute_estimate(
        scope=['kitchen'], condition='good', sqft=1500,
        property_type='Single Family', state='TX',
    )
    assert poor['subtotal_low'] > good['subtotal_low']


def test_full_gut_suppresses_per_item_lines():
    result = renovation_service.compute_estimate(
        scope=['full_gut', 'kitchen', 'bathrooms', 'roof'], condition='average',
        sqft=2000, property_type='Single Family', state='TX',
    )
    # Only the full_gut line item should survive
    scopes = [li['scope'] for li in result['line_items']]
    assert scopes == ['full_gut']


def test_contingency_totals_are_sensible():
    result = renovation_service.compute_estimate(
        scope=['cosmetic', 'kitchen'], condition='average',
        sqft=1800, property_type='Single Family', state='TX',
    )
    assert result['contingency_10pct'] == round(result['subtotal_low'] * 0.10)
    assert result['contingency_20pct'] == round(result['subtotal_high'] * 0.20)
    assert result['total_low'] == result['subtotal_low'] + result['contingency_10pct']
    assert result['total_high'] == result['subtotal_high'] + result['contingency_20pct']


def test_cost_per_sqft_computed():
    result = renovation_service.compute_estimate(
        scope=['cosmetic'], condition='average', sqft=2000,
        property_type='Single Family', state='TX',
    )
    assert result['cost_per_sqft_low'] > 0
    assert result['cost_per_sqft_high'] >= result['cost_per_sqft_low']


# ── ARV uplift ────────────────────────────────────────────────────────────────

def test_arv_uplift_without_fair_value():
    result = renovation_service.compute_arv_uplift(
        scope=['kitchen', 'bathrooms'], fair_value_low=None, fair_value_high=None,
    )
    assert result['arv_low'] is None
    assert result['arv_high'] is None


def test_arv_uplift_kitchen_plus_baths():
    result = renovation_service.compute_arv_uplift(
        scope=['kitchen', 'bathrooms'], fair_value_low=300000, fair_value_high=350000,
    )
    # mid = 325000, +10-15% → ~357,500 – 373,750
    assert result['arv_low'] > 325000
    assert result['arv_high'] > result['arv_low']
    assert result['uplift_low_pct'] == 10.0
    assert result['uplift_high_pct'] == 15.0


def test_arv_uplift_full_gut_is_highest():
    result = renovation_service.compute_arv_uplift(
        scope=['full_gut'], fair_value_low=300000, fair_value_high=350000,
    )
    assert result['uplift_low_pct'] == 20.0
    assert result['uplift_high_pct'] == 30.0


# ── Endpoint tests ────────────────────────────────────────────────────────────

@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.fixture(autouse=True)
def override_db_and_claude():
    async def fake_db():
        mock = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        mock.execute = AsyncMock(return_value=result)
        yield mock

    app.dependency_overrides[get_db] = fake_db
    # Stub Claude SOW so tests don't hit the network
    with patch.object(renovation_service, 'generate_sow', new_callable=AsyncMock, return_value="Stubbed SOW narrative."):
        yield
    app.dependency_overrides.pop(get_db, None)


async def test_endpoint_returns_full_payload(client):
    body = {
        "scope": ["cosmetic", "kitchen", "bathrooms"],
        "condition": "average",
        "sqft": 1840,
        "state": "TX",
        "property_type": "Single Family",
        "fair_value_low": 318000,
        "fair_value_high": 347000,
    }
    resp = await client.post("/properties/p1/renovation-estimate", json=body)
    assert resp.status_code == 200
    data = resp.json()
    for field in ("line_items", "subtotal_low", "subtotal_high", "total_low",
                  "total_high", "cost_per_sqft_low", "cost_per_sqft_high",
                  "arv_low", "arv_high", "uplift_low_pct", "uplift_high_pct",
                  "scope_of_work", "scope", "condition"):
        assert field in data, f"missing {field}"
    assert data['scope_of_work'] == "Stubbed SOW narrative."


async def test_endpoint_rejects_empty_scope(client):
    resp = await client.post("/properties/p1/renovation-estimate", json={
        "scope": [], "condition": "average", "sqft": 1500, "state": "TX",
    })
    assert resp.status_code == 422


async def test_endpoint_filters_invalid_scope_items(client):
    resp = await client.post("/properties/p1/renovation-estimate", json={
        "scope": ["kitchen", "not_a_scope", "bogus"],
        "condition": "average", "sqft": 1500, "state": "TX",
    })
    assert resp.status_code == 200
    returned = set(resp.json()['scope'])
    assert returned == {"kitchen"}


async def test_endpoint_pulls_fair_value_from_mock_when_absent(client):
    # p3 has fair_value_low=388000, fair_value_high=421000 in MOCK_PROPERTIES
    resp = await client.post("/properties/p3/renovation-estimate", json={
        "scope": ["kitchen", "bathrooms"], "condition": "average",
        "sqft": 2280, "state": "TX",
    })
    assert resp.status_code == 200
    data = resp.json()
    # ARV uplift should use the mock's fair value range
    assert data['arv_low'] is not None
    assert data['arv_high'] is not None
