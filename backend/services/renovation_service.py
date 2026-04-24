"""
Renovation cost estimation.

Baseline cost ranges come from industry data (RSMeans-style). Each item is
either per-house, per-unit (bath, window), or per-sqft. State multipliers adjust
for labor/materials differences. A final 10% or 20% contingency converts
subtotal into low/high totals.

Also returns an ARV uplift range and (if Claude is configured) a narrative
scope of work. If Claude is absent the SOW falls back to a generated list.
"""
import logging
from typing import Literal

import anthropic

from ..config import get_settings

log = logging.getLogger(__name__)

# Each entry is one of:
#   "per_house"  — (low, high) flat totals
#   "per_unit"   — (low_per_unit, high_per_unit) × count
#   "per_sqft"   — (low_per_sqft, high_per_sqft) × sqft
_COSTS: dict[str, dict] = {
    "roof":       {"kind": "per_house", "low": 8000,  "high": 18000, "default_count": 1},
    "hvac":       {"kind": "per_house", "low": 5000,  "high": 12000, "default_count": 1},
    "kitchen":    {"kind": "per_house", "low": 15000, "high": 45000, "default_count": 1},
    "bathrooms":  {"kind": "per_unit",  "low": 8000,  "high": 20000, "default_count": None},  # uses bath count
    "flooring":   {"kind": "per_sqft",  "low": 4,     "high": 8,     "default_count": None},
    "windows":    {"kind": "per_unit",  "low": 400,   "high": 800,   "default_count": 12},
    "electrical": {"kind": "per_house", "low": 8000,  "high": 20000, "default_count": 1},
    "plumbing":   {"kind": "per_house", "low": 5000,  "high": 15000, "default_count": 1},
    "foundation": {"kind": "per_house", "low": 5000,  "high": 25000, "default_count": 1},
    "exterior":   {"kind": "per_house", "low": 8000,  "high": 20000, "default_count": 1},
    "cosmetic":   {"kind": "per_sqft",  "low": 2,     "high": 5,     "default_count": None},
    "full_gut":   {"kind": "per_sqft",  "low": 60,    "high": 120,   "default_count": None},
}

VALID_SCOPES = set(_COSTS.keys())

_STATE_MULTIPLIERS: dict[str, float] = {
    "TX": 0.95, "FL": 1.05, "TN": 0.90, "AZ": 0.95, "GA": 0.92, "CA": 1.40, "NY": 1.45,
    "NC": 0.92, "SC": 0.93, "CO": 1.05, "UT": 1.00, "NV": 1.05, "OH": 0.88, "IN": 0.88,
    "MO": 0.90, "OK": 0.88, "AR": 0.85, "VA": 1.00, "AL": 0.87, "MA": 1.25, "IL": 1.08,
}

_CONDITION_MULTIPLIERS: dict[str, float] = {
    "poor": 1.20,
    "fair": 1.08,
    "average": 1.00,
    "good": 0.90,
}

Scope = Literal[
    "roof", "hvac", "kitchen", "bathrooms", "flooring", "windows",
    "electrical", "plumbing", "foundation", "exterior", "cosmetic", "full_gut",
]


def compute_estimate(
    scope: list[str],
    condition: str,
    sqft: float,
    property_type: str,
    state: str,
    baths: float | None = None,
) -> dict:
    """Compute line items, subtotal, contingency, and totals.

    - Bathroom cost scales by baths (defaults to 2 if not provided).
    - Flooring/cosmetic/full_gut scale by sqft.
    - Windows use a default count of 12 (typical SFR).
    - If full_gut is selected, per-item line items are suppressed — full_gut
      is priced on top of the per-sqft total and assumed to include the rest.
    """
    state_mult = _STATE_MULTIPLIERS.get(state.upper(), 1.0)
    cond_mult = _CONDITION_MULTIPLIERS.get(condition.lower(), 1.0)
    multiplier = state_mult * cond_mult
    baths_count = baths if baths and baths > 0 else 2.0

    items: list[dict] = []
    subtotal_low = 0.0
    subtotal_high = 0.0

    full_gut = "full_gut" in scope

    for s in scope:
        if s not in _COSTS:
            continue
        # If full_gut is selected, skip per-item entries — they're covered by the gut spec.
        if full_gut and s != "full_gut":
            continue

        cost = _COSTS[s]
        kind = cost["kind"]
        if kind == "per_house":
            low, high = cost["low"], cost["high"]
            notes = "Typical full-house scope"
        elif kind == "per_unit":
            count = baths_count if s == "bathrooms" else cost["default_count"]
            low = cost["low"] * count
            high = cost["high"] * count
            notes = f"Across {count:.1f} bath{'s' if count != 1 else ''}" if s == "bathrooms" else f"Across {int(count)} windows"
        elif kind == "per_sqft":
            low = cost["low"] * sqft
            high = cost["high"] * sqft
            notes = f"${cost['low']}–${cost['high']}/sqft across {int(sqft):,} sqft"
            if s == "full_gut":
                notes = f"Full gut-rehab at ${cost['low']}–${cost['high']}/sqft"
        else:
            continue

        low = round(low * multiplier)
        high = round(high * multiplier)
        items.append({
            "scope": s,
            "low": low,
            "high": high,
            "notes": notes,
        })
        subtotal_low += low
        subtotal_high += high

    contingency_low = round(subtotal_low * 0.10)
    contingency_high = round(subtotal_high * 0.20)
    total_low = round(subtotal_low + contingency_low)
    total_high = round(subtotal_high + contingency_high)

    per_sqft_low = round(total_low / sqft, 2) if sqft > 0 else 0
    per_sqft_high = round(total_high / sqft, 2) if sqft > 0 else 0

    return {
        "line_items": items,
        "subtotal_low": round(subtotal_low),
        "subtotal_high": round(subtotal_high),
        "contingency_10pct": contingency_low,
        "contingency_20pct": contingency_high,
        "total_low": total_low,
        "total_high": total_high,
        "cost_per_sqft_low": per_sqft_low,
        "cost_per_sqft_high": per_sqft_high,
        "state_multiplier": state_mult,
        "condition_multiplier": cond_mult,
    }


def compute_arv_uplift(
    scope: list[str],
    fair_value_low: float | None,
    fair_value_high: float | None,
) -> dict:
    """ARV uplift range based on scope breadth.

    Baseline: cosmetic 5–8%, kitchen+baths 10–15%, structural 8–12%, full gut 20–30%.
    Scopes compound — if kitchen + baths + roof + hvac, both buckets apply (take max).
    """
    if not fair_value_low or not fair_value_high or fair_value_high <= 0:
        return {
            "arv_low": None, "arv_high": None,
            "uplift_low_pct": 0.0, "uplift_high_pct": 0.0,
        }

    uplift_low = 0.0
    uplift_high = 0.0

    scope_set = set(scope)
    has_cosmetic = "cosmetic" in scope_set or ("flooring" in scope_set and len(scope_set) <= 2)
    has_kitchen_bath = "kitchen" in scope_set and "bathrooms" in scope_set
    has_structural = bool(scope_set & {"roof", "hvac", "electrical", "plumbing", "foundation"})
    has_gut = "full_gut" in scope_set

    if has_gut:
        uplift_low = max(uplift_low, 0.20)
        uplift_high = max(uplift_high, 0.30)
    else:
        if has_kitchen_bath:
            uplift_low = max(uplift_low, 0.10)
            uplift_high = max(uplift_high, 0.15)
        if has_structural:
            uplift_low = max(uplift_low, 0.08)
            uplift_high = max(uplift_high, 0.12)
        if has_cosmetic:
            uplift_low = max(uplift_low, 0.05)
            uplift_high = max(uplift_high, 0.08)

    # Apply to the upper bound (investor-style ARV — renovated property tends to trade at high end)
    base = (fair_value_low + fair_value_high) / 2
    return {
        "arv_low": round(base * (1 + uplift_low)),
        "arv_high": round(base * (1 + uplift_high)),
        "uplift_low_pct": round(uplift_low * 100, 1),
        "uplift_high_pct": round(uplift_high * 100, 1),
    }


async def generate_sow(
    scope: list[str],
    condition: str,
    sqft: float,
    property_type: str,
    state: str,
    total_low: float,
    total_high: float,
) -> str:
    """Claude-generated scope-of-work narrative. Falls back to a templated summary
    if ANTHROPIC_API_KEY is missing or the call fails."""
    settings = get_settings()
    if not settings.anthropic_api_key or not scope:
        return _fallback_sow(scope, condition, sqft, state, total_low, total_high)

    scope_list = ", ".join(s.replace("_", " ") for s in scope)
    prompt = (
        f"Write a concise 3-paragraph scope-of-work narrative for a "
        f"{int(sqft):,} sqft {property_type} renovation in {state}. "
        f"Current condition: {condition}. Scope includes: {scope_list}. "
        f"Total budget: ${int(total_low):,}–${int(total_high):,}. "
        "Paragraph 1: summary of work. Paragraph 2: sequencing and timeline. "
        "Paragraph 3: key risks, permitting, and inspection milestones. "
        "Tone: professional contractor-grade. No marketing language."
    )
    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        resp = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=600,
            system="You are a professional general contractor writing scope-of-work narratives.",
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text.strip()
    except Exception as exc:
        log.warning("Claude SOW generation failed: %s", exc)
        return _fallback_sow(scope, condition, sqft, state, total_low, total_high)


def _fallback_sow(
    scope: list[str], condition: str, sqft: float, state: str,
    total_low: float, total_high: float,
) -> str:
    if not scope:
        return "No scope items selected. Add scope items above to generate an estimate."
    items = ", ".join(s.replace("_", " ") for s in scope)
    return (
        f"This renovation targets a {int(sqft):,} sqft property in {state} in {condition} condition. "
        f"Scope of work: {items}. Total budget range: ${int(total_low):,}–${int(total_high):,}, "
        f"inclusive of a 10–20% contingency.\n\n"
        "Sequence: permits and demo first, then rough-in trades (framing, plumbing, electrical, HVAC), "
        "followed by finish trades (drywall, flooring, cabinetry, paint). Keep at least two weeks between "
        "rough-in and finish inspections to allow for punch-list corrections.\n\n"
        "Risks to monitor: permit delays in the local jurisdiction, material lead times on HVAC and cabinets, "
        "and surprises found once demo begins (rot, knob-and-tube wiring, failing plumbing stacks). "
        "Budget the 20% contingency if you haven't walked the property with a contractor yet."
    )
