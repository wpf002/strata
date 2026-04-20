"""
Risk scoring across three dimensions: pricing, days-on-market, and condition.
Returns a composite 0–100 score and per-dimension breakdown.
"""
from datetime import datetime

import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.property import Property
from ..schemas.property import RiskResponse, RiskDimension, RiskFlag

_FEMA_URL = (
    "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query"
)

_ZONE_MAP = {
    "AE": ("High Risk", "1% annual flood chance"),
    "A": ("High Risk", "1% annual flood chance"),
    "AO": ("High Risk", "1% annual flood chance"),
    "AH": ("High Risk", "1% annual flood chance"),
    "A99": ("High Risk", "1% annual flood chance"),
    "VE": ("Very High Risk", "Coastal high risk"),
    "V": ("Very High Risk", "Coastal high risk"),
    "X": ("Low Risk", "Minimal flood risk"),  # unshaded default; shaded handled below
    "D": ("Undetermined", "Flood risk not studied"),
}

_UNKNOWN_FLOOD = {
    "zone": "Unknown",
    "in_sfha": False,
    "risk_label": "Unknown",
    "description": "Flood data unavailable for this location",
}


async def get_flood_zone(lat: float, lon: float) -> dict:
    try:
        params = {
            "geometry": f"{lon},{lat}",
            "geometryType": "esriGeometryPoint",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
            "f": "json",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(_FEMA_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        features = data.get("features", [])
        if not features:
            return _UNKNOWN_FLOOD

        attrs = features[0].get("attributes", {})
        zone = attrs.get("FLD_ZONE", "Unknown")
        subtype = attrs.get("ZONE_SUBTY", "") or ""
        in_sfha = attrs.get("SFHA_TF", "F") == "T"

        # X shaded = moderate risk
        if zone == "X" and "SHADED" in subtype.upper():
            return {
                "zone": zone,
                "in_sfha": in_sfha,
                "risk_label": "Moderate Risk",
                "description": "0.2% annual flood chance",
            }

        risk_label, description = _ZONE_MAP.get(zone, ("Unknown", "Flood data unavailable"))
        return {"zone": zone, "in_sfha": in_sfha, "risk_label": risk_label, "description": description}

    except Exception:
        return _UNKNOWN_FLOOD


async def get_risk(db: AsyncSession, subject: Property) -> RiskResponse:
    dimensions: list[RiskDimension] = []
    flags: list[RiskFlag] = []

    # ── 1. Pricing Risk ──────────────────────────────────────────────────────
    pricing_score, pricing_flags = _pricing_risk(subject)
    dimensions.append(pricing_score)
    flags.extend(pricing_flags)

    # ── 2. Days-on-Market Risk ───────────────────────────────────────────────
    zip_median_dom = await _zip_median_dom(db, subject.zip)
    dom_score, dom_flags = _dom_risk(subject, zip_median_dom)
    dimensions.append(dom_score)
    flags.extend(dom_flags)

    # ── 3. Condition Risk ────────────────────────────────────────────────────
    cond_score, cond_flags = _condition_risk(subject)
    dimensions.append(cond_score)
    flags.extend(cond_flags)

    weights = [0.40, 0.30, 0.30]
    composite = sum(d.score * w for d, w in zip(dimensions, weights))

    return RiskResponse(
        property_id=str(subject.id),
        composite_score=round(composite, 1),
        dimensions=dimensions,
        flags=flags,
    )


def _pricing_risk(prop: Property) -> tuple[RiskDimension, list[RiskFlag]]:
    data = prop.data or {}
    list_price = data.get("list_price", 0)
    fair_value_mid = data.get("fair_value_mid", list_price) or list_price

    if not fair_value_mid or not list_price:
        return RiskDimension(name="Pricing", score=50.0, description="Insufficient data"), []

    deviation_pct = ((list_price - fair_value_mid) / fair_value_mid) * 100
    # Score increases with positive deviation (overpriced = higher risk)
    score = min(100, max(0, 50 + deviation_pct * 4))
    flags = []
    if deviation_pct > 10:
        flags.append(RiskFlag(label=f"Priced {deviation_pct:.1f}% above fair value", severity="High"))
    elif deviation_pct > 5:
        flags.append(RiskFlag(label=f"Priced {deviation_pct:.1f}% above fair value", severity="Medium"))

    return (
        RiskDimension(name="Pricing", score=round(score, 1), description=f"{deviation_pct:+.1f}% vs AVM"),
        flags,
    )


def _dom_risk(prop: Property, zip_median: float) -> tuple[RiskDimension, list[RiskFlag]]:
    data = prop.data or {}
    dom = data.get("days_on_market", 0)
    if not dom or not zip_median:
        return RiskDimension(name="Days on Market", score=30.0, description="No DOM data"), []

    ratio = dom / zip_median
    score = min(100, max(0, (ratio - 1) * 50 + 30))
    flags = []
    if dom > zip_median * 2:
        flags.append(RiskFlag(label=f"DOM {dom}d — 2× zip median", severity="High"))
    elif dom > zip_median * 1.4:
        flags.append(RiskFlag(label=f"DOM {dom}d — above zip median", severity="Medium"))

    return (
        RiskDimension(name="Days on Market", score=round(score, 1), description=f"{dom}d (zip median {zip_median:.0f}d)"),
        flags,
    )


def _condition_risk(prop: Property) -> tuple[RiskDimension, list[RiskFlag]]:
    if not prop.year_built:
        return RiskDimension(name="Condition", score=40.0, description="Year built unknown"), []

    age = datetime.now().year - prop.year_built
    # Linear ramp: 0 yrs → score 10, 30 yrs → score 55, 50+ yrs → score 90
    score = min(90, max(10, age * 1.6))
    flags = []
    if age >= 40:
        flags.append(RiskFlag(label=f"Property age {age} yrs — major systems at risk", severity="Medium"))
    if age >= 25:
        flags.append(RiskFlag(label=f"HVAC age est. {max(0, age - 15)} yrs", severity="Medium"))
    if age >= 20:
        flags.append(RiskFlag(label=f"Roof age est. {max(0, age - 12)} yrs", severity="Low" if age < 30 else "Medium"))

    return (
        RiskDimension(name="Condition", score=round(score, 1), description=f"Built {prop.year_built} ({age} yrs old)"),
        flags,
    )


async def _zip_median_dom(db: AsyncSession, zip_code: str | None) -> float:
    if not zip_code:
        return 30.0
    result = await db.execute(
        select(func.avg(Property.data["days_on_market"].as_float())).where(
            Property.zip == zip_code
        )
    )
    val = result.scalar()
    return float(val) if val else 30.0
