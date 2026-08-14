"""
Comp-based valuation.

Untested before, and it's the number the whole Intelligence page is built
around — fair value drives price-vs-fair-value, the buy/negotiate/avoid call,
and the offer range. The interesting behaviour is all in when it *refuses* to
produce a confident answer.
"""
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.models.property import Property
from backend.services.valuation_service import get_valuation, SQFT_ADJUSTMENT_RATE


def prop(**over) -> Property:
    p = Property(
        id=uuid.uuid4(),
        address="4521 Oak Creek Dr",
        city="Dallas",
        state="TX",
        zip="75201",
        sqft=1_840,
        property_type="Single Family",
        data={"list_price": 342_000},
    )
    for k, v in over.items():
        setattr(p, k, v)
    return p


def db_returning(comps):
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = comps
    db.execute = AsyncMock(return_value=result)
    return db


def comp(price: int, sqft: int) -> Property:
    return prop(
        id=uuid.uuid4(),
        address=f"{price} Comp Ln",
        sqft=sqft,
        data={"list_price": price},
        last_updated=datetime.now(timezone.utc) - timedelta(days=30),
    )


# ── Fallback behaviour ───────────────────────────────────────────────────────

async def test_no_sqft_falls_back_and_says_so():
    """Without square footage there's nothing to adjust comps against."""
    v = await get_valuation(db_returning([]), prop(sqft=None))
    assert v.confidence == "Low"
    assert v.comp_count == 0
    assert v.comps == []


async def test_fallback_anchors_the_range_to_list_price():
    subject = prop(sqft=None, data={"list_price": 400_000})
    v = await get_valuation(db_returning([]), subject)
    assert v.fair_value_mid == 400_000
    assert v.fair_value_low < 400_000 < v.fair_value_high


async def test_fallback_never_claims_confidence_it_does_not_have():
    """A single comp is not a comp set."""
    v = await get_valuation(db_returning([comp(340_000, 1_800)]), prop())
    assert v.confidence == "Low"
    assert v.comp_count == 0


async def test_missing_list_price_on_comps_falls_back():
    bad = [prop(id=uuid.uuid4(), sqft=1_800, data={}), prop(id=uuid.uuid4(), sqft=1_820, data={})]
    v = await get_valuation(db_returning(bad), prop())
    assert v.comp_count == 0
    assert v.confidence == "Low"


# ── Comp-based path ──────────────────────────────────────────────────────────

async def test_uses_the_mean_of_size_adjusted_comps():
    comps = [comp(340_000, 1_840), comp(360_000, 1_840)]  # same sqft → no adjustment
    v = await get_valuation(db_returning(comps), prop(sqft=1_840))
    assert v.comp_count == 2
    assert v.fair_value_mid == 350_000


async def test_smaller_comps_are_adjusted_upward_toward_the_subject():
    """The subject is bigger, so a smaller comp implies a higher subject value."""
    small = comp(340_000, 1_640)  # 200 sqft smaller
    same = comp(340_000, 1_840)
    v = await get_valuation(db_returning([small, same]), prop(sqft=1_840))

    expected_mid = ((340_000 + 200 * SQFT_ADJUSTMENT_RATE) + 340_000) / 2
    assert v.fair_value_mid == pytest.approx(round(expected_mid), abs=1)
    assert v.fair_value_mid > 340_000


async def test_confidence_rises_with_the_number_of_comps():
    two = await get_valuation(db_returning([comp(340_000, 1_840) for _ in range(2)]), prop())
    three = await get_valuation(db_returning([comp(340_000, 1_840) for _ in range(3)]), prop())
    five = await get_valuation(db_returning([comp(340_000, 1_840) for _ in range(5)]), prop())
    assert two.confidence == "Low"
    assert three.confidence == "Medium"
    assert five.confidence == "High"


async def test_range_brackets_the_midpoint():
    comps = [comp(340_000, 1_840) for _ in range(4)]
    v = await get_valuation(db_returning(comps), prop())
    assert v.fair_value_low < v.fair_value_mid < v.fair_value_high
    # 5% spread each way
    assert v.fair_value_high - v.fair_value_mid == pytest.approx(v.fair_value_mid * 0.05, rel=0.01)


async def test_every_returned_comp_is_described():
    comps = [comp(340_000, 1_800), comp(355_000, 1_900)]
    v = await get_valuation(db_returning(comps), prop())
    assert len(v.comps) == 2
    for c in v.comps:
        assert c["address"]
        assert c["sqft"] > 0
        assert c["adjusted_value"] > 0
