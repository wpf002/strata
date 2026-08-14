"""
Risk scoring — pricing, days-on-market and condition, blended 40/30/30.

Untested before. Risk score gates the recommendation and drives the red/amber
badges on every card, so its direction and its "no data" behaviour both matter:
a scorer that silently returns a middling number for missing data looks the
same as one that measured something.
"""
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.models.property import Property
from backend.services.risk_service import _condition_risk, _dom_risk, _pricing_risk, get_risk


def prop(**over) -> Property:
    p = Property(
        id=uuid.uuid4(),
        address="4521 Oak Creek Dr",
        zip="75201",
        year_built=2001,
        data={"list_price": 342_000, "fair_value_mid": 342_000, "days_on_market": 23},
    )
    for k, v in over.items():
        setattr(p, k, v)
    return p


def db_with_median(value):
    db = AsyncMock()
    result = MagicMock()
    result.scalar.return_value = value
    result.scalar_one_or_none.return_value = value
    db.execute = AsyncMock(return_value=result)
    return db


# ── Pricing ──────────────────────────────────────────────────────────────────

def test_priced_at_fair_value_is_neutral():
    dim, flags = _pricing_risk(prop())
    assert dim.score == 50.0
    assert flags == []


def test_overpriced_scores_riskier_than_underpriced():
    over, _ = _pricing_risk(prop(data={"list_price": 400_000, "fair_value_mid": 342_000}))
    under, _ = _pricing_risk(prop(data={"list_price": 300_000, "fair_value_mid": 342_000}))
    assert over.score > 50 > under.score


def test_significant_overpricing_raises_a_high_severity_flag():
    _, flags = _pricing_risk(prop(data={"list_price": 400_000, "fair_value_mid": 342_000}))
    assert any(f.severity == "High" for f in flags)


def test_mild_overpricing_is_only_medium():
    _, flags = _pricing_risk(prop(data={"list_price": 366_000, "fair_value_mid": 342_000}))  # ~7%
    assert flags and all(f.severity == "Medium" for f in flags)


def test_pricing_score_is_clamped_to_the_scale():
    absurd, _ = _pricing_risk(prop(data={"list_price": 3_000_000, "fair_value_mid": 300_000}))
    bargain, _ = _pricing_risk(prop(data={"list_price": 30_000, "fair_value_mid": 300_000}))
    assert 0 <= bargain.score <= 100
    assert 0 <= absurd.score <= 100


def test_missing_price_data_says_insufficient_rather_than_guessing():
    dim, flags = _pricing_risk(prop(data={}))
    assert dim.description == "Insufficient data"
    assert flags == []


# ── Days on market ───────────────────────────────────────────────────────────

def test_dom_at_the_zip_median_is_baseline():
    dim, flags = _dom_risk(prop(data={"days_on_market": 30}), zip_median=30)
    assert dim.score == pytest.approx(30.0, abs=0.1)
    assert flags == []


def test_stale_listings_score_riskier():
    fresh, _ = _dom_risk(prop(data={"days_on_market": 10}), zip_median=30)
    stale, _ = _dom_risk(prop(data={"days_on_market": 90}), zip_median=30)
    assert stale.score > fresh.score


def test_double_the_median_flags_high():
    _, flags = _dom_risk(prop(data={"days_on_market": 70}), zip_median=30)
    assert any(f.severity == "High" for f in flags)


def test_no_dom_data_is_labelled_not_scored_as_good():
    dim, flags = _dom_risk(prop(data={}), zip_median=30)
    assert dim.description == "No DOM data"
    assert flags == []


# ── Condition ────────────────────────────────────────────────────────────────

def test_older_properties_score_riskier():
    year = datetime.now().year
    new, _ = _condition_risk(prop(year_built=year - 2))
    old, _ = _condition_risk(prop(year_built=year - 60))
    assert old.score > new.score
    assert 10 <= new.score <= 90 and 10 <= old.score <= 90


def test_condition_flags_accumulate_with_age():
    year = datetime.now().year
    _, young = _condition_risk(prop(year_built=year - 5))
    _, mid = _condition_risk(prop(year_built=year - 26))
    _, ancient = _condition_risk(prop(year_built=year - 45))
    assert len(young) == 0
    assert len(mid) >= 2      # HVAC + roof
    assert len(ancient) >= 3  # + major systems


def test_unknown_year_built_is_labelled():
    dim, flags = _condition_risk(prop(year_built=None))
    assert dim.description == "Year built unknown"
    assert flags == []


def test_hvac_and_roof_ages_are_never_negative():
    year = datetime.now().year
    _, flags = _condition_risk(prop(year_built=year - 20))
    for f in flags:
        assert "-" not in f.label.split("est.")[-1]


# ── Composite ────────────────────────────────────────────────────────────────

async def test_composite_is_the_weighted_blend_of_the_three_dimensions():
    subject = prop()
    r = await get_risk(db_with_median(30), subject)

    assert len(r.dimensions) == 3
    expected = sum(d.score * w for d, w in zip(r.dimensions, [0.40, 0.30, 0.30]))
    assert r.composite_score == pytest.approx(round(expected, 1), abs=0.05)


async def test_composite_stays_within_the_scale_for_a_worst_case_property():
    subject = prop(
        year_built=1900,
        data={"list_price": 900_000, "fair_value_mid": 300_000, "days_on_market": 400},
    )
    r = await get_risk(db_with_median(30), subject)
    assert 0 <= r.composite_score <= 100


async def test_a_clean_property_scores_lower_than_a_troubled_one():
    year = datetime.now().year
    clean = prop(year_built=year - 3, data={"list_price": 300_000, "fair_value_mid": 320_000, "days_on_market": 8})
    troubled = prop(year_built=1950, data={"list_price": 400_000, "fair_value_mid": 300_000, "days_on_market": 180})

    r_clean = await get_risk(db_with_median(30), clean)
    r_troubled = await get_risk(db_with_median(30), troubled)
    assert r_clean.composite_score < r_troubled.composite_score
