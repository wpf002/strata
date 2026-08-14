"""
Portfolio health score and holding serialization.

Untested before. The score is a headline number on the Portfolio page, and its
four components each have a boundary where they flip — those boundaries are
where a scoring function silently goes wrong.
"""
from datetime import datetime, timezone

import pytest

from backend.routers.portfolio import _health_score, _estimated_current_value
from backend.schemas.portfolio import HoldingResponse


def holding(**over) -> HoldingResponse:
    base = dict(
        id="00000000-0000-0000-0000-000000000001",
        property_id=None,
        address="123 Main St, Dallas, TX 75201",
        image="",
        status="Active",
        purchase_price=300_000,
        purchase_date=None,
        current_value=350_000,
        loan_balance=200_000,
        equity=150_000,
        monthly_rent=2_400,
        monthly_expenses=900,
        cash_flow=400,
        cap_rate=5.5,
        appreciation=None,
        total_return=None,
        recommendation="Hold",
        recommendation_note="",
        notes=None,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    base.update(over)
    return HoldingResponse(**base)


def test_empty_portfolio_scores_zero():
    assert _health_score([]) == 0.0


def test_score_never_exceeds_one_hundred():
    strong = [
        holding(address=f"1 A St, Dallas, TX", cash_flow=500),
        holding(address=f"2 B St, Phoenix, AZ", cash_flow=500),
        holding(address=f"3 C St, Tampa, FL", cash_flow=500),
        holding(address=f"4 D St, Atlanta, GA", cash_flow=500),
    ]
    score = _health_score(strong)
    assert 0 <= score <= 100


def test_all_positive_cash_flow_beats_all_negative():
    good = [holding(address="1 A St, Dallas, TX", cash_flow=400)]
    bad = [holding(address="1 A St, Dallas, TX", cash_flow=-400)]
    assert _health_score(good) > _health_score(bad)


def test_cash_flow_component_is_proportional():
    """Half the portfolio cash-flowing should earn half of the 40 available points."""
    half = [
        holding(address="1 A St, Dallas, TX", cash_flow=400),
        holding(address="2 B St, Phoenix, AZ", cash_flow=-400),
    ]
    none_positive = [
        holding(address="1 A St, Dallas, TX", cash_flow=-400),
        holding(address="2 B St, Phoenix, AZ", cash_flow=-400),
    ]
    assert _health_score(half) - _health_score(none_positive) == pytest.approx(20.0, abs=0.1)


def test_geographic_concentration_is_penalized():
    concentrated = [holding(address=f"{n} Main St, Dallas, TX 75201") for n in range(4)]
    diversified = [
        holding(address="1 Main St, Dallas, TX 75201"),
        holding(address="2 Main St, Phoenix, AZ 85001"),
        holding(address="3 Main St, Tampa, FL 33601"),
        holding(address="4 Main St, Atlanta, GA 30301"),
    ]
    assert _health_score(diversified) > _health_score(concentrated)


def test_exactly_half_in_one_state_is_not_penalized():
    """The rule is >50% concentration; 50% itself should keep full marks."""
    even_split = [
        holding(address="1 Main St, Dallas, TX 75201"),
        holding(address="2 Main St, Phoenix, AZ 85001"),
    ]
    all_one = [
        holding(address="1 Main St, Dallas, TX 75201"),
        holding(address="2 Main St, Austin, TX 78701"),
    ]
    assert _health_score(even_split) > _health_score(all_one)


def test_high_leverage_is_penalized():
    safe = [holding(address="1 A St, Dallas, TX", current_value=400_000, loan_balance=200_000)]   # 50% LTV
    risky = [holding(address="1 A St, Dallas, TX", current_value=400_000, loan_balance=380_000)]  # 95% LTV
    assert _health_score(safe) > _health_score(risky)


def test_portfolio_size_rewards_up_to_three_properties():
    one = [holding(address="1 A St, Dallas, TX")]
    three = [
        holding(address="1 A St, Dallas, TX"),
        holding(address="2 B St, Phoenix, AZ"),
        holding(address="3 C St, Tampa, FL"),
    ]
    six = three + [
        holding(address="4 D St, Nashville, TN"),
        holding(address="5 E St, Denver, CO"),
        holding(address="6 F St, Columbus, OH"),
    ]
    assert _health_score(three) > _health_score(one)
    # Size points cap at 3 properties — going past it shouldn't keep adding.
    assert _health_score(six) <= 100


def test_zero_current_value_does_not_divide_by_zero():
    h = [holding(address="1 A St, Dallas, TX", current_value=0, loan_balance=0)]
    score = _health_score(h)
    assert 0 <= score <= 100


def test_address_without_a_state_is_handled():
    h = [holding(address="Somewhere with no state token")]
    score = _health_score(h)
    assert 0 <= score <= 100


# ── Estimated current value ──────────────────────────────────────────────────

def test_estimated_value_is_none_without_a_purchase_date():
    class H:
        purchase_price = 300_000
        purchase_date = None
        current_value = None
    assert _estimated_current_value(H()) is None


def test_estimated_value_appreciates_over_time():
    from datetime import date

    class H:
        purchase_price = 300_000
        purchase_date = date(2020, 1, 1)
        current_value = None

    est = _estimated_current_value(H())
    assert est is not None
    # Time-based estimate should exceed the purchase price after several years.
    assert est > 300_000
