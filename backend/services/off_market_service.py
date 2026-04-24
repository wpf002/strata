"""
Off-market / motivated-seller signal detection.

Surfaces distressed-seller indicators computable from existing listing and
property data — DOM anomalies, price-reduction patterns, absentee-owner
heuristics, assessment vs list gap, and market-time outliers.

All signals degrade gracefully when supporting data is missing. The final
motivation score is 0–100; > 50 is displayed as a "Motivated Seller" badge.
"""
from typing import Any


SignalSeverity = str  # "low" | "medium" | "high"


def _severity_weight(severity: SignalSeverity) -> int:
    return {"high": 25, "medium": 15, "low": 8}.get(severity, 0)


def compute_signals(
    prop: dict[str, Any],
    zip_median_dom: float | None = None,
) -> dict:
    """Compute off-market signals for a single property record.

    `prop` is a dict shape — either from MOCK_PROPERTIES, a serialized
    PropertyResponse, or the `data` JSONB field of a Property row. We read
    fields defensively so any combination works.

    Returns {
      has_signals: bool,
      signals: [{ type, label, severity }...],
      motivation_score: int,  # 0-100
    }
    """
    signals: list[dict] = []

    dom = _as_int(prop.get("days_on_market") or prop.get("daysOnMarket"))
    list_price = _as_float(prop.get("price") or prop.get("list_price") or prop.get("listPrice"))
    fair_value_low = _as_float(prop.get("fair_value_low") or prop.get("fairValueLow"))
    fair_value_high = _as_float(prop.get("fair_value_high") or prop.get("fairValueHigh"))
    fair_value_mid = _as_float(prop.get("fair_value_mid") or prop.get("fairValueMid"))
    if not fair_value_mid and fair_value_low and fair_value_high:
        fair_value_mid = (fair_value_low + fair_value_high) / 2

    price_reductions = _as_int(prop.get("price_reductions") or prop.get("priceReductions"))
    has_price_reduction = bool(
        prop.get("has_price_reduction") or prop.get("hasPriceReduction")
    )
    assessed_value = _as_float(prop.get("assessed_value") or prop.get("assessedValue"))
    owner_address = prop.get("owner_address") or prop.get("ownerAddress")
    property_address = prop.get("address")
    property_type = prop.get("type") or prop.get("property_type") or prop.get("propertyType")

    # 1. Extended listing without price reduction
    if dom is not None and dom > 90 and not (price_reductions or has_price_reduction):
        signals.append({
            "type": "extended_listing",
            "label": f"On market {dom} days with no price reduction — possible motivated seller",
            "severity": "medium",
        })

    # 2. Multiple price reductions
    if price_reductions and price_reductions >= 2:
        signals.append({
            "type": "multiple_price_reductions",
            "label": f"Seller has cut price {price_reductions} times",
            "severity": "high",
        })
    elif has_price_reduction:
        signals.append({
            "type": "price_reduction",
            "label": "Seller has reduced asking price",
            "severity": "medium",
        })

    # 3. Absentee owner (SFR only, when owner data is present)
    if property_type and "Single Family" in str(property_type):
        if owner_address and property_address and _addresses_differ(owner_address, property_address):
            signals.append({
                "type": "absentee_owner",
                "label": "Owner address differs from property — possible absentee",
                "severity": "medium",
            })

    # 4. Assessment vs list price divergence
    if assessed_value and list_price and list_price > 0:
        ratio = assessed_value / list_price
        if ratio < 0.65:
            signals.append({
                "type": "assessment_gap",
                "label": f"Tax assessment is {ratio*100:.0f}% of list price — verify condition",
                "severity": "medium",
            })

    # 5. Market-time outlier for zip + type
    if dom is not None and zip_median_dom and zip_median_dom > 0:
        if dom > zip_median_dom * 2.0:
            signals.append({
                "type": "dom_outlier",
                "label": f"DOM {dom}d is 2x+ the zip median ({zip_median_dom:.0f}d)",
                "severity": "high",
            })

    # 6. Listed significantly below comp-based fair value (possible distressed sale)
    if fair_value_mid and list_price and fair_value_mid > 0:
        discount = (fair_value_mid - list_price) / fair_value_mid
        if discount > 0.10:
            signals.append({
                "type": "below_value",
                "label": f"Listed {discount*100:.1f}% below fair value estimate",
                "severity": "high",
            })

    score = min(100, sum(_severity_weight(s["severity"]) for s in signals))
    return {
        "has_signals": bool(signals),
        "signals": signals,
        "motivation_score": score,
    }


def _addresses_differ(a: str, b: str) -> bool:
    """Loose comparison — strip whitespace + case, compare first 30 chars of street line."""
    return a.strip().lower()[:30] != b.strip().lower()[:30]


def _as_int(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _as_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None
