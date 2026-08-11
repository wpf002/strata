"""Property demand signal — aggregates STRATA user engagement per property.

Demand score reflects how many distinct investors are interacting with a
property. A high score means the deal is getting analyzed by many others,
so investors may want to move faster or look for an edge. A low score can
actually be an opportunity — competition is limited.
"""
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.property import Property
from ..models.user_property_activity import UserPropertyActivity
from ..services.property_service import MOCK_PROPERTIES

# Weights per interaction type — higher weight = higher intent signal.
# Matches the leads engagement weighting so signals are consistent.
_WEIGHTS = {"viewed": 1, "copilot_asked": 2, "saved": 3, "reported": 4, "underwritten": 5}

# Score calibration: at ~25 weighted distinct interactions a property is
# considered fully saturated ("score 100"). This is intentionally aggressive
# so most properties land in Low/Medium until real traction shows.
_SATURATION_RAW = 25

# Rough market-DOM baselines for the "vs market" note.
# Sourced from typical early-2026 market data; we're not shipping live values
# here to keep the endpoint fast and mock-friendly.
_MARKET_DOM = {
    "Dallas": 28,
    "Phoenix": 34,
    "Nashville": 32,
    "Atlanta": 30,
    "Tampa": 25,
    "Austin": 42,
}


def _demand_label(score: int) -> str:
    if score >= 70:
        return "High — multiple investors analyzing"
    if score >= 35:
        return "Medium — some investor interest"
    return "Low — limited investor activity"


def _note(
    views: int,
    saves: int,
    underwrites: int,
    price_drops: int,
    dom: int | None,
    city: str | None,
) -> str:
    bits: list[str] = []
    total_investors = max(views, underwrites + saves)
    if underwrites > 0:
        bits.append(f"{underwrites} investor{'s' if underwrites != 1 else ''} ran underwriting in the last 30 days")
    elif total_investors > 0:
        bits.append(f"{total_investors} investor{'s' if total_investors != 1 else ''} analyzed this in the last 30 days")

    if price_drops > 0:
        bits.append(f"Price reduced {price_drops} time{'s' if price_drops != 1 else ''} — possible motivated seller")

    if dom is not None and city and city in _MARKET_DOM:
        avg = _MARKET_DOM[city]
        if dom > avg + 10:
            bits.append(f"{dom} days on market — above {city} average of {avg}")
        elif dom < avg - 5:
            bits.append(f"{dom} days on market — below {city} average of {avg}")

    if not bits:
        bits.append("No investor activity yet — you'd be one of the first")
    return ". ".join(bits)


def _vs_market_dom(dom: int | None, city: str | None) -> str:
    if dom is None or city not in _MARKET_DOM:
        return "Baseline unavailable"
    avg = _MARKET_DOM[city]
    if dom > avg + 5:
        return "Above avg"
    if dom < avg - 5:
        return "Below avg"
    return "On pace"


async def _property_meta(db: AsyncSession, pid: str) -> dict:
    """
    City / DOM / price-drop count for the "vs market" note.

    Reads the stored property first — live RapidAPI listings are cached there,
    and looking only at MOCK_PROPERTIES meant every real listing silently came
    back as "Baseline unavailable" with zero price drops. Mock is the fallback,
    not the source.
    """
    try:
        row = (
            await db.execute(select(Property).where(Property.id == uuid.UUID(pid)))
        ).scalar_one_or_none()
    except (ValueError, AttributeError):
        row = None  # non-UUID id — mock datasets use short slugs

    if row is not None:
        data = row.data or {}
        return {
            "city": row.city,
            "days_on_market": data.get("days_on_market"),
            "price_drops": data.get("price_reductions")
            or (1 if data.get("has_price_reduction") else 0),
        }

    p = next((x for x in MOCK_PROPERTIES if x["id"] == pid), None)
    if not p:
        return {"city": None, "days_on_market": None, "price_drops": 0}
    return {
        "city": p.get("city"),
        "days_on_market": p.get("days_on_market"),
        "price_drops": p.get("price_reductions") or (1 if p.get("has_price_reduction") else 0),
    }


async def _distinct_counts_by_type(
    db: AsyncSession, property_id: str, window_days: int = 30,
) -> dict[str, int]:
    """Returns distinct-user counts per activity type within the window."""
    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    result = await db.execute(
        select(
            UserPropertyActivity.user_id,
            UserPropertyActivity.activity_type,
        ).where(
            and_(
                UserPropertyActivity.property_id == property_id,
                UserPropertyActivity.last_occurred_at >= since,
            )
        )
    )

    users_by_type: dict[str, set] = defaultdict(set)
    for user_id, activity_type in result.all():
        users_by_type[activity_type].add(user_id)
    return {k: len(v) for k, v in users_by_type.items()}


def _score_from_counts(counts: dict[str, int]) -> int:
    raw = sum(_WEIGHTS.get(k, 1) * v for k, v in counts.items())
    return max(0, min(100, round((raw / _SATURATION_RAW) * 100)))


async def get_demand_signal(db: AsyncSession, property_id: str) -> dict:
    counts = await _distinct_counts_by_type(db, property_id)
    score = _score_from_counts(counts)
    meta = await _property_meta(db, property_id)

    return {
        "propertyId": property_id,
        "strataViews30d": counts.get("viewed", 0),
        "strataSaves30d": counts.get("saved", 0),
        "strataUnderwrites30d": counts.get("underwritten", 0),
        "demandScore": score,
        "demandLabel": _demand_label(score),
        "priceDropCount": meta["price_drops"],
        "daysOnMarket": meta["days_on_market"],
        "vsMarketDom": _vs_market_dom(meta["days_on_market"], meta["city"]),
        "note": _note(
            counts.get("viewed", 0),
            counts.get("saved", 0),
            counts.get("underwritten", 0),
            meta["price_drops"],
            meta["days_on_market"],
            meta["city"],
        ),
    }


async def get_demand_signals_bulk(
    db: AsyncSession, property_ids: list[str],
) -> dict[str, dict]:
    """Cheap version for search-result decoration — only returns score + label,
    skips the narrative note to keep payload small."""
    if not property_ids:
        return {}

    since = datetime.now(timezone.utc) - timedelta(days=30)
    result = await db.execute(
        select(
            UserPropertyActivity.property_id,
            UserPropertyActivity.user_id,
            UserPropertyActivity.activity_type,
        ).where(
            and_(
                UserPropertyActivity.property_id.in_(property_ids),
                UserPropertyActivity.last_occurred_at >= since,
            )
        )
    )

    per_property: dict[str, dict[str, set]] = {pid: defaultdict(set) for pid in property_ids}
    for pid, user_id, activity_type in result.all():
        per_property.setdefault(pid, defaultdict(set))[activity_type].add(user_id)

    return {
        pid: {
            "propertyId": pid,
            "demandScore": _score_from_counts({k: len(v) for k, v in buckets.items()}),
            "demandLabel": _demand_label(_score_from_counts({k: len(v) for k, v in buckets.items()})),
        }
        for pid, buckets in per_property.items()
    }
