"""
Comp-based AVM. Pulls comparable sales from the properties table, applies
a ±$60/sqft adjustment for size difference, and returns a value range.
Falls back to a price-per-sqft estimate when comp count is too low.
"""
from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.property import Property
from ..schemas.property import ValuationResponse

SQFT_ADJUSTMENT_RATE = 60.0  # dollars per sqft delta


async def get_valuation(
    db: AsyncSession,
    subject: Property,
) -> ValuationResponse:
    if not subject.sqft or not subject.zip:
        return _fallback_valuation(subject)

    cutoff = datetime.now(timezone.utc) - timedelta(days=180)
    sqft_min = subject.sqft * 0.80
    sqft_max = subject.sqft * 1.20

    result = await db.execute(
        select(Property).where(
            and_(
                Property.zip == subject.zip,
                Property.id != subject.id,
                Property.property_type == subject.property_type,
                Property.sqft >= sqft_min,
                Property.sqft <= sqft_max,
                Property.last_updated >= cutoff,
            )
        ).limit(10)
    )
    comps = result.scalars().all()

    if len(comps) < 2:
        return _fallback_valuation(subject)

    adjusted_values = []
    comp_dicts = []
    for c in comps:
        comp_price = c.data.get("list_price") or c.data.get("sale_price")
        if not comp_price or not c.sqft:
            continue
        sqft_diff = (subject.sqft - c.sqft)
        adjustment = sqft_diff * SQFT_ADJUSTMENT_RATE
        adjusted = comp_price + adjustment
        adjusted_values.append(adjusted)
        comp_dicts.append({
            "id": str(c.id),
            "address": c.address,
            "sqft": c.sqft,
            "list_price": comp_price,
            "adjusted_value": round(adjusted),
            "sqft_adjustment": round(adjustment),
        })

    if len(adjusted_values) < 2:
        return _fallback_valuation(subject)

    mid = sum(adjusted_values) / len(adjusted_values)
    spread = mid * 0.05
    confidence: Literal["High", "Medium", "Low"] = (
        "High" if len(adjusted_values) >= 5 else
        "Medium" if len(adjusted_values) >= 3 else
        "Low"
    )

    return ValuationResponse(
        property_id=str(subject.id),
        fair_value_low=round(mid - spread),
        fair_value_high=round(mid + spread),
        fair_value_mid=round(mid),
        confidence=confidence,
        comp_count=len(adjusted_values),
        comps=comp_dicts,
    )


def _fallback_valuation(subject: Property) -> ValuationResponse:
    data = subject.data or {}
    list_price = data.get("list_price", 0)
    mid = list_price or 0
    spread = mid * 0.08

    return ValuationResponse(
        property_id=str(subject.id),
        fair_value_low=round(mid - spread),
        fair_value_high=round(mid + spread),
        fair_value_mid=round(mid),
        confidence="Low",
        comp_count=0,
        comps=[],
    )
