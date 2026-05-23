"""
Property data layer. Queries the database first; if ATTOM_API_KEY is present,
enriches with live data. When no DB record exists, falls back to a mock dataset
so the API never crashes on missing API keys.
"""
import hashlib
import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.property import Property
from ..schemas.property import PropertyResponse, RiskFlag, OffMarketSignal
from . import off_market_service
from .markets_service import resolve_market

log = logging.getLogger(__name__)

# ── Photo URL upgrader ────────────────────────────────────────────────────────
# Realtor.com's RDCPIX CDN encodes image size as a single letter before .jpg
# (t=thumb, s=small, m=medium, l=large, x=xl). The free API returns small
# thumbnails; we rewrite to x for retina-quality listing cards.
_RDCPIX_SIZE_RE = re.compile(r"([tsmlx])(\.jpg)$", re.IGNORECASE)


def _upgrade_photo_url(url: str | None) -> str | None:
    if not url:
        return url
    if "rdcpix.com" in url:
        return _RDCPIX_SIZE_RE.sub(r"x\2", url)
    return url

# ── RapidAPI quota + cache protection ─────────────────────────────────────────
# Mirrors rent_service: persistent disk cache + monthly counter. Prevents the
# frontend from burning through quota during filter-tweaking / polling loops.
_RAPID_DIR = Path(__file__).parent.parent / ".rapidapi"
_RAPID_DIR.mkdir(exist_ok=True)
_RAPID_CACHE_FILE = _RAPID_DIR / "search_cache.json"
_RAPID_USAGE_FILE = _RAPID_DIR / "usage.json"
_RAPID_CACHE_TTL = 6 * 60 * 60      # 6h — listings change slowly; long TTL keeps repeated demo/prep searches of the same market off the quota meter
RAPIDAPI_MONTHLY_LIMIT = 450         # free tier is typically 500/mo — leave headroom


def _rapid_month_key() -> str:
    t = time.gmtime()
    return f"{t.tm_year}-{t.tm_mon:02d}"


def _rapid_load(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def _rapid_save(path: Path, data: dict) -> None:
    try:
        path.write_text(json.dumps(data))
    except Exception:
        pass


def _rapid_under_quota() -> bool:
    usage = _rapid_load(_RAPID_USAGE_FILE)
    return usage.get(_rapid_month_key(), 0) < RAPIDAPI_MONTHLY_LIMIT


def _rapid_record_call() -> None:
    usage = _rapid_load(_RAPID_USAGE_FILE)
    key = _rapid_month_key()
    usage[key] = usage.get(key, 0) + 1
    _rapid_save(_RAPID_USAGE_FILE, usage)


def _rapid_cache_key(body: dict) -> str:
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:24]


def get_rapidapi_usage() -> dict:
    """Expose current RapidAPI call count for debugging/admin endpoints."""
    usage = _rapid_load(_RAPID_USAGE_FILE)
    return {
        "month": _rapid_month_key(),
        "calls_this_month": usage.get(_rapid_month_key(), 0),
        "limit": RAPIDAPI_MONTHLY_LIMIT,
        "remaining": max(0, RAPIDAPI_MONTHLY_LIMIT - usage.get(_rapid_month_key(), 0)),
    }

MOCK_PROPERTIES = [
    {
        "id": "p1", "address": "4521 Oak Creek Drive", "city": "Dallas", "state": "TX", "zip": "75201",
        "price": 342000, "beds": 3, "baths": 2.0, "sqft": 1840, "lot_sqft": 6200, "year_built": 2001,
        "type": "Single Family", "status": "Active", "days_on_market": 23,
        "deal_score": 81, "risk_score": 28, "cap_rate": 6.4, "cash_on_cash": 7.2, "cash_flow": 312,
        "fair_value_low": 318000, "fair_value_high": 347000,
        "rent_est_low": 2100, "rent_est_high": 2380, "rent_est_mid": 2240,
        "rent_confidence": "High", "valuation_confidence": "High",
        "price_vs_fair_value": -1.4, "strategy_fit": 88,
        "neighborhood": "Lake Highlands", "neighborhood_score": 74, "market_regime": "Balanced",
        "risk_flags": [{"label": "HVAC age est. 14 yrs", "severity": "Medium"}, {"label": "Hail risk — moderate", "severity": "Low"}],
        "image": "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=85&auto=format&fit=crop",
        "lat": 32.7767, "lng": -96.7970,
    },
    {
        "id": "p2", "address": "1872 Magnolia Street", "city": "Dallas", "state": "TX", "zip": "75206",
        "price": 285000, "beds": 3, "baths": 2.0, "sqft": 1520, "lot_sqft": 5400, "year_built": 1995,
        "type": "Single Family", "status": "Active", "days_on_market": 11,
        "deal_score": 74, "risk_score": 35, "cap_rate": 5.8, "cash_on_cash": 6.1, "cash_flow": 198,
        "fair_value_low": 274000, "fair_value_high": 299000,
        "rent_est_low": 1750, "rent_est_high": 1980, "rent_est_mid": 1860,
        "rent_confidence": "High", "valuation_confidence": "Medium",
        "price_vs_fair_value": 0.7, "strategy_fit": 72,
        "neighborhood": "Lakewood", "neighborhood_score": 81, "market_regime": "Hot",
        "risk_flags": [{"label": "Roof age est. 18 yrs", "severity": "High"}, {"label": "Tax reassessment likely", "severity": "Medium"}],
        "image": "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200&q=85&auto=format&fit=crop",
        "lat": 32.7957, "lng": -96.7543,
    },
    {
        "id": "p3", "address": "9034 Sunset Ridge Ln", "city": "Dallas", "state": "TX", "zip": "75218",
        "price": 419000, "beds": 4, "baths": 3.0, "sqft": 2280, "lot_sqft": 8100, "year_built": 2008,
        "type": "Single Family", "status": "Active", "days_on_market": 112,
        "price_reductions": 2, "has_price_reduction": True, "assessed_value": 265000,
        "deal_score": 62, "risk_score": 42, "cap_rate": 4.9, "cash_on_cash": 5.2, "cash_flow": 88,
        "fair_value_low": 388000, "fair_value_high": 421000,
        "rent_est_low": 2450, "rent_est_high": 2780, "rent_est_mid": 2610,
        "rent_confidence": "Medium", "valuation_confidence": "Medium",
        "price_vs_fair_value": 2.1, "strategy_fit": 58,
        "neighborhood": "White Rock", "neighborhood_score": 69, "market_regime": "Cooling",
        "risk_flags": [
            {"label": "HOA reserve underfunded", "severity": "Medium"},
            {"label": "Investor saturation 42%", "severity": "Medium"},
            {"label": "Permit open — addition 2019", "severity": "High"},
        ],
        "image": "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=85&auto=format&fit=crop",
        "lat": 32.8212, "lng": -96.7021,
    },
    {
        "id": "p4", "address": "2218 Cedar Springs Rd", "city": "Dallas", "state": "TX", "zip": "75219",
        "price": 198000, "beds": 2, "baths": 1.0, "sqft": 980, "lot_sqft": 3200, "year_built": 1962,
        "type": "Condo", "status": "Active", "days_on_market": 68,
        "deal_score": 44, "risk_score": 67, "cap_rate": 3.8, "cash_on_cash": 3.2, "cash_flow": -84,
        "fair_value_low": 171000, "fair_value_high": 194000,
        "rent_est_low": 1100, "rent_est_high": 1350, "rent_est_mid": 1220,
        "rent_confidence": "Low", "valuation_confidence": "Low",
        "price_vs_fair_value": 9.2, "strategy_fit": 28,
        "neighborhood": "Uptown", "neighborhood_score": 88, "market_regime": "Buyer's Market",
        "risk_flags": [
            {"label": "Negative cash flow at standard financing", "severity": "High"},
            {"label": "HOA $620/mo — elevated", "severity": "High"},
            {"label": "Priced 9% above fair value", "severity": "High"},
            {"label": "STR restrictions active", "severity": "Medium"},
        ],
        "image": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&q=85&auto=format&fit=crop",
        "lat": 32.8031, "lng": -96.8099,
    },
    {
        "id": "p5", "address": "517 Elmwood Avenue", "city": "Dallas", "state": "TX", "zip": "75208",
        "price": 378000, "beds": 4, "baths": 2.5, "sqft": 2010, "lot_sqft": 7200, "year_built": 2014,
        "type": "Single Family", "status": "Active", "days_on_market": 6,
        "deal_score": 77, "risk_score": 22, "cap_rate": 6.1, "cash_on_cash": 6.8, "cash_flow": 274,
        "fair_value_low": 362000, "fair_value_high": 392000,
        "rent_est_low": 2380, "rent_est_high": 2620, "rent_est_mid": 2500,
        "rent_confidence": "High", "valuation_confidence": "High",
        "price_vs_fair_value": -0.8, "strategy_fit": 84,
        "neighborhood": "Bishop Arts", "neighborhood_score": 79, "market_regime": "Hot",
        "risk_flags": [{"label": "Low inventory — move fast", "severity": "Low"}],
        "image": "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200&q=85&auto=format&fit=crop",
        "lat": 32.7456, "lng": -96.8312,
    },
    {
        "id": "p6", "address": "3301 Harvest Glen Dr", "city": "Dallas", "state": "TX", "zip": "75234",
        "price": 312000, "beds": 3, "baths": 2.0, "sqft": 1680, "lot_sqft": 5800, "year_built": 1998,
        "type": "Single Family", "status": "Active", "days_on_market": 98,
        "has_price_reduction": True,
        "deal_score": 69, "risk_score": 31, "cap_rate": 5.6, "cash_on_cash": 6.0, "cash_flow": 156,
        "fair_value_low": 298000, "fair_value_high": 326000,
        "rent_est_low": 1920, "rent_est_high": 2180, "rent_est_mid": 2050,
        "rent_confidence": "High", "valuation_confidence": "High",
        "price_vs_fair_value": -0.6, "strategy_fit": 76,
        "neighborhood": "Farmers Branch", "neighborhood_score": 67, "market_regime": "Balanced",
        "risk_flags": [{"label": "Declining school rating", "severity": "Medium"}],
        "image": "https://images.unsplash.com/photo-1598228723793-52759bba239c?w=1200&q=85&auto=format&fit=crop",
        "lat": 32.9270, "lng": -96.8996,
    },
]


def _mock_to_response(p: dict) -> PropertyResponse:
    return PropertyResponse(
        id=p["id"],
        address=p["address"],
        city=p["city"],
        state=p["state"],
        zip=p["zip"],
        price=p["price"],
        beds=p["beds"],
        baths=p["baths"],
        sqft=p["sqft"],
        lot_sqft=p.get("lot_sqft"),
        year_built=p.get("year_built"),
        type=p["type"],
        status=p["status"],
        days_on_market=p["days_on_market"],
        deal_score=p["deal_score"],
        risk_score=p["risk_score"],
        cap_rate=p["cap_rate"],
        cash_on_cash=p["cash_on_cash"],
        cash_flow=p["cash_flow"],
        fair_value_low=p["fair_value_low"],
        fair_value_high=p["fair_value_high"],
        rent_est_low=p["rent_est_low"],
        rent_est_high=p["rent_est_high"],
        rent_est_mid=p["rent_est_mid"],
        rent_confidence=p["rent_confidence"],
        valuation_confidence=p["valuation_confidence"],
        price_vs_fair_value=p["price_vs_fair_value"],
        strategy_fit=p["strategy_fit"],
        neighborhood=p.get("neighborhood"),
        neighborhood_score=p.get("neighborhood_score"),
        market_regime=p.get("market_regime"),
        risk_flags=[RiskFlag(**f) for f in p.get("risk_flags", [])],
        image=p.get("image"),
        lat=p.get("lat"),
        lng=p.get("lng"),
    )


async def search_properties(
    db: AsyncSession,
    query: str | None = None,
    min_deal_score: float | None = None,
    max_price: float | None = None,
    min_cap_rate: float | None = None,
    property_types: list[str] | None = None,
    sort_by: str | None = None,
    off_market_only: bool = False,
    min_motivation_score: int | None = None,
) -> list[PropertyResponse]:
    settings = get_settings()

    # Use RapidAPI if key is present, then ATTOM, then mock
    if settings.rapidapi_key:
        live = await _search_rapidapi(
            query, min_deal_score, max_price, min_cap_rate, property_types, sort_by,
            settings.rapidapi_key,
        )
        if live:
            return _apply_off_market_filter(live, off_market_only, min_motivation_score, sort_by)

    if settings.attom_api_key:
        live = await _search_attom(
            query, min_deal_score, max_price, min_cap_rate, property_types, sort_by
        )
        if live:
            return _apply_off_market_filter(live, off_market_only, min_motivation_score, sort_by)

    results = list(MOCK_PROPERTIES)

    if query:
        parts = [s.strip().lower() for s in query.replace(',', ' ').split()]
        results = [
            p for p in results
            if any(
                part in p["address"].lower()
                or part in p["city"].lower()
                or part in p["state"].lower()
                or part in p["zip"]
                for part in parts
            )
        ]
    if min_deal_score is not None:
        results = [p for p in results if p["deal_score"] >= min_deal_score]
    if max_price is not None:
        results = [p for p in results if p["price"] <= max_price]
    if min_cap_rate is not None:
        results = [p for p in results if p["cap_rate"] >= min_cap_rate]
    if property_types:
        results = [p for p in results if p["type"] in property_types]

    sort_map = {
        "Deal Score": (lambda p: p["deal_score"], True),
        "Price": (lambda p: p["price"], False),
        "Cap Rate": (lambda p: p["cap_rate"], True),
        "Cash Flow": (lambda p: p["cash_flow"], True),
        "Days on Market": (lambda p: p["days_on_market"], False),
    }
    if sort_by and sort_by in sort_map:
        key_fn, reverse = sort_map[sort_by]
        results.sort(key=key_fn, reverse=reverse)

    responses = [_mock_to_response(p) for p in results]
    source_by_id = {p["id"]: p for p in results}
    return _apply_off_market_filter(responses, off_market_only, min_motivation_score, sort_by, source_by_id)


def _apply_off_market_filter(
    props: list[PropertyResponse],
    off_market_only: bool,
    min_motivation_score: int | None,
    sort_by: str | None,
    source_by_id: dict | None = None,
) -> list[PropertyResponse]:
    """Compute motivation score on each result and optionally filter/sort by it.

    Signal detection prefers `source_by_id[p.id]` when available — the raw source
    dict carries fields (price_reductions, assessed_value, owner_address) that the
    narrower PropertyResponse schema drops.
    """
    enriched: list[PropertyResponse] = []
    for p in props:
        source = (source_by_id or {}).get(p.id) or p.model_dump()
        sig = off_market_service.compute_signals(source)
        p.motivation_score = sig["motivation_score"]
        p.off_market_signals = [OffMarketSignal(**s) for s in sig["signals"]] if sig["has_signals"] else []
        enriched.append(p)

    threshold = min_motivation_score if min_motivation_score is not None else (30 if off_market_only else None)
    if threshold is not None:
        enriched = [p for p in enriched if (p.motivation_score or 0) >= threshold]

    if sort_by == "Motivation Score":
        enriched.sort(key=lambda p: p.motivation_score or 0, reverse=True)
    return enriched


def find_in_rapidapi_cache(property_id: str) -> PropertyResponse | None:
    """Resolve a listing the user recently saw in search from the on-disk
    RapidAPI cache. Lets detail / valuation / Copilot / Memo work on live
    listings without the (removed) detail endpoint or re-billing the API."""
    try:
        cache = _rapid_load(_RAPID_CACHE_FILE)
        for entry in cache.values():
            for p in entry.get("data", []):
                if str(p.get("id")) == str(property_id):
                    resp = PropertyResponse.model_validate(p)
                    resp.image = _upgrade_photo_url(resp.image)
                    return resp
    except Exception:
        pass
    return None


async def resolve_property_dict(db: AsyncSession, property_id: str) -> dict | None:
    """Single resolver for consumers that want a plain dict (Copilot, Memo).
    Mock IDs return their rich source dict unchanged; live IDs resolve through
    get_property_by_id (DB / cache / detail) and are dumped to snake_case."""
    mock = next((p for p in MOCK_PROPERTIES if p["id"] == property_id), None)
    if mock:
        return mock
    resp = await get_property_by_id(db, property_id)
    return resp.model_dump() if resp else None


async def get_property_by_id(
    db: AsyncSession, property_id: str
) -> PropertyResponse | None:
    settings = get_settings()

    # 1. DB by native UUID
    try:
        uid = uuid.UUID(property_id)
        result = await db.execute(select(Property).where(Property.id == uid))
        prop = result.scalar_one_or_none()
        if prop:
            return _db_to_response(prop)
    except ValueError:
        pass

    # 2. DB by external_id (RapidAPI property_id) — prevents re-billing on revisit
    try:
        result = await db.execute(
            select(Property).where(Property.data["external_id"].astext == property_id)
        )
        prop = result.scalar_one_or_none()
        if prop:
            # Preserve the external_id as the returned id so frontend links stay stable
            resp = _db_to_response(prop)
            resp.id = property_id
            return resp
    except Exception:
        pass

    # 3. Mock fallback (p1–p6)
    match = next((p for p in MOCK_PROPERTIES if p["id"] == property_id), None)
    if match:
        return _mock_to_response(match)

    # 3.5 RapidAPI search cache — the listing the user just saw in the feed.
    # Resolves clicks without re-billing RapidAPI or hitting the (removed)
    # /properties/v3/detail endpoint.
    cached = find_in_rapidapi_cache(property_id)
    if cached:
        return cached

    # 4. (Disabled) Fresh RapidAPI detail call. The realty-in-us /v3/detail
    # endpoint was removed upstream, so this call always 404s — and it still
    # bills a quota unit. Listings the user actually navigates to are resolved
    # from the search cache above, so skipping this saves quota with no UX loss.
    return None


def _db_to_response(prop: Property) -> PropertyResponse:
    d = prop.data or {}
    return PropertyResponse(
        id=str(prop.id),
        address=prop.address,
        city=prop.city or "",
        state=prop.state or "",
        zip=prop.zip or "",
        price=d.get("list_price", 0),
        beds=prop.beds or 0,
        baths=prop.baths or 0,
        sqft=prop.sqft or 0,
        lot_sqft=d.get("lot_sqft"),
        year_built=prop.year_built,
        type=prop.property_type or "Unknown",
        status=d.get("status", "Unknown"),
        days_on_market=d.get("days_on_market", 0),
        deal_score=d.get("deal_score", 0),
        risk_score=d.get("risk_score", 50),
        cap_rate=d.get("cap_rate", 0),
        cash_on_cash=d.get("cash_on_cash", 0),
        cash_flow=d.get("cash_flow", 0),
        fair_value_low=d.get("fair_value_low", 0),
        fair_value_high=d.get("fair_value_high", 0),
        rent_est_low=d.get("rent_est_low", 0),
        rent_est_high=d.get("rent_est_high", 0),
        rent_est_mid=d.get("rent_est_mid", 0),
        rent_confidence=d.get("rent_confidence", "Low"),
        valuation_confidence=d.get("valuation_confidence", "Low"),
        price_vs_fair_value=d.get("price_vs_fair_value", 0),
        strategy_fit=d.get("strategy_fit", 0),
        neighborhood=d.get("neighborhood"),
        neighborhood_score=d.get("neighborhood_score"),
        market_regime=d.get("market_regime"),
        risk_flags=[RiskFlag(**f) for f in d.get("risk_flags", [])],
        image=_upgrade_photo_url(d.get("image")),
        lat=prop.lat,
        lng=prop.lon,
    )


async def _fetch_rapidapi_property(
    property_id: str, api_key: str, db: AsyncSession
) -> PropertyResponse | None:
    # Quota protection — shared with search quota since both consume the same plan.
    if not _rapid_under_quota():
        log.warning("RapidAPI quota exhausted; skipping detail fetch for %s", property_id)
        return None

    # Migrated to POST + JSON body (Apr 2026).
    url = "https://realty-in-us.p.rapidapi.com/properties/v3/detail"
    headers = {
        "X-RapidAPI-Key": api_key,
        "X-RapidAPI-Host": "realty-in-us.p.rapidapi.com",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json={"property_id": property_id}, headers=headers)
            _rapid_record_call()
            if resp.status_code == 429:
                log.warning("RapidAPI detail rate-limited (429)")
                return None
            if resp.status_code != 200:
                log.warning("RapidAPI detail returned %s for %s: %s",
                            resp.status_code, property_id, resp.text[:200])
                return None
            data = resp.json()
    except Exception as exc:
        log.warning("RapidAPI detail call failed for %s: %s", property_id, exc)
        return None

    home = (data.get("data") or {}).get("home") or {}
    if not home:
        return None

    try:
        loc = home.get("location", {})
        addr = loc.get("address", {})
        desc = home.get("description", {})
        coord = addr.get("coordinate", {})

        price = home.get("list_price") or home.get("price") or 0
        beds = desc.get("beds") or 0
        baths = float(desc.get("baths") or 0)
        sqft = desc.get("sqft") or 1
        year_built = desc.get("year_built")
        address = addr.get("line") or "Unknown Address"
        city_val = addr.get("city") or ""
        state_val = addr.get("state_code") or ""
        zip_val = addr.get("postal_code") or ""
        lat = float(coord.get("lat") or 0) or None
        lng = float(coord.get("lon") or 0) or None
        image_href = _upgrade_photo_url((home.get("primary_photo") or {}).get("href"))

        rent_mid = round(sqft * 1.2 + beds * 80 + baths * 60)
        rent_low = round(rent_mid * 0.88)
        rent_high = round(rent_mid * 1.12)
        noi_mo = rent_mid * 0.5
        cap_rate = round((noi_mo * 12 / price * 100) if price > 0 else 0, 1)
        deal_score = _compute_deal_score(price, cap_rate, sqft, beds)
        risk_score = _compute_risk_score(year_built, price, sqft)
        fv_mid_pct = 1.0 + ((50 - deal_score) / 100) * 0.10
        fair_value_mid = max(1, round(price * fv_mid_pct))
        fair_value_low = round(fair_value_mid * 0.96)
        fair_value_high = round(fair_value_mid * 1.04)
        price_vs_fv = round(((price - fair_value_mid) / fair_value_mid) * 100, 1)
        neighborhood_score = _neighborhood_score_estimate(zip_val, deal_score, risk_score)
        down = price * 0.25
        loan = price - down
        mr = 7.25 / 100 / 12
        mtg = loan * (mr * (1 + mr) ** 360) / ((1 + mr) ** 360 - 1)
        egi = rent_mid * 0.94
        opex = egi * 0.08 + price * 0.022 / 12 + 140 + price * 0.01 / 12
        cash_flow = round(egi - opex - mtg)
        coc = round(((cash_flow * 12) / (down + 8500)) * 100, 1)

        # Cache in DB
        try:
            new_prop = Property(
                address=address,
                city=city_val,
                state=state_val,
                zip=zip_val,
                lat=lat,
                lon=lng,
                beds=beds,
                baths=baths,
                sqft=sqft,
                year_built=year_built,
                property_type=desc.get("type") or "Single Family",
                data={
                    "external_id": property_id,
                    "list_price": price,
                    "status": home.get("status") or "Active",
                    "days_on_market": home.get("days_on_market") or 0,
                    "deal_score": deal_score,
                    "risk_score": risk_score,
                    "cap_rate": cap_rate,
                    "cash_on_cash": coc,
                    "cash_flow": cash_flow,
                    "fair_value_low": fair_value_low,
                    "fair_value_high": fair_value_high,
                    "rent_est_low": rent_low,
                    "rent_est_mid": rent_mid,
                    "rent_est_high": rent_high,
                    "rent_confidence": "Low",
                    "valuation_confidence": "Low",
                    "price_vs_fair_value": price_vs_fv,
                    "strategy_fit": round(deal_score * 0.9),
                    "market_regime": "Balanced",
                    "image": image_href,
                    "risk_flags": [],
                    "neighborhood_score": neighborhood_score,
                },
            )
            db.add(new_prop)
            await db.flush()
        except Exception:
            pass

        return PropertyResponse(
            id=property_id,
            address=address,
            city=city_val,
            state=state_val,
            zip=zip_val,
            price=price,
            beds=beds,
            baths=baths,
            sqft=sqft,
            year_built=year_built,
            type=desc.get("type") or "Single Family",
            status=home.get("status") or "Active",
            days_on_market=(home.get("days_on_market") or 0) or _days_since_list_date(home.get("list_date")),
            deal_score=deal_score,
            risk_score=risk_score,
            cap_rate=cap_rate,
            cash_on_cash=coc,
            cash_flow=cash_flow,
            fair_value_low=fair_value_low,
            fair_value_high=fair_value_high,
            rent_est_low=rent_low,
            rent_est_mid=rent_mid,
            rent_est_high=rent_high,
            rent_confidence="Low",
            valuation_confidence="Low",
            price_vs_fair_value=price_vs_fv,
            strategy_fit=round(deal_score * 0.9),
            neighborhood=None,
            neighborhood_score=neighborhood_score,
            market_regime="Balanced",
            risk_flags=[],
            image=image_href,
            lat=lat,
            lng=lng,
        )
    except Exception:
        return None


async def _search_attom(
    query, min_deal_score, max_price, min_cap_rate, property_types, sort_by
) -> list[PropertyResponse]:
    return []


async def _search_rapidapi(
    query: str | None,
    min_deal_score: float | None,
    max_price: float | None,
    min_cap_rate: float | None,
    property_types: list[str] | None,
    sort_by: str | None,
    api_key: str,
) -> list[PropertyResponse]:
    # Parse "City, STATE" or "ZIP"
    market = resolve_market(query)
    if market:
        city, state = market["city"], market["state_code"]
    else:
        parts = [s.strip() for s in (query or "Dallas, TX").replace(",", " ").split() if s.strip()]
        city = parts[0] if parts else "Dallas"
        state = parts[1] if len(parts) > 1 else "TX"
    zip_code = None
    if query:
        zip_code = next(
            (p.strip() for p in query.replace(",", " ").split() if p.strip().isdigit() and len(p.strip()) == 5),
            None,
        )

    # realty-in-us migrated to POST + JSON body (Apr 2026).
    url = "https://realty-in-us.p.rapidapi.com/properties/v3/list"
    body: dict = {
        "limit": 20,
        "offset": 0,
        "status": ["for_sale", "ready_to_build"],
        "sort": {"direction": "desc", "field": "list_date"},
    }
    if zip_code:
        body["postal_code"] = zip_code
    else:
        body["city"] = city
        body["state_code"] = state

    # ── Cache check ──────────────────────────────────────────────────────────
    # 15-minute TTL on the upstream request body only (same city/state/zip).
    # We cache UNFILTERED results so that different users applying different
    # local filters all share the upstream RapidAPI call. Filters + sort are
    # applied after, whether results come fresh or from cache.
    cache_key = _rapid_cache_key(body)
    cache = _rapid_load(_RAPID_CACHE_FILE)
    entry = cache.get(cache_key)
    if entry and time.time() - entry["ts"] < _RAPID_CACHE_TTL:
        try:
            cached = [PropertyResponse.model_validate(p) for p in entry["data"]]
            # Cached entries may predate the photo-size upgrade; retro-fix on read.
            for c in cached:
                c.image = _upgrade_photo_url(c.image)
            return _apply_rapidapi_filters_sort(
                cached, min_deal_score, max_price, min_cap_rate, property_types, sort_by,
            )
        except Exception:
            pass  # fall through to fresh call if the cache shape is stale

    # ── Quota check ──────────────────────────────────────────────────────────
    if not _rapid_under_quota():
        usage = get_rapidapi_usage()
        log.warning(
            "RapidAPI monthly quota exhausted (%d/%d this month) — falling back",
            usage["calls_this_month"], usage["limit"],
        )
        return []

    headers = {
        "X-RapidAPI-Key": api_key,
        "X-RapidAPI-Host": "realty-in-us.p.rapidapi.com",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=body, headers=headers)
            # Record call regardless of outcome — RapidAPI bills on request, not success.
            _rapid_record_call()
            if resp.status_code == 429:
                log.warning("RapidAPI rate-limited (429) — backing off")
                return []
            if resp.status_code != 200:
                log.warning("RapidAPI list returned %s: %s", resp.status_code, resp.text[:200])
                return []
            data = resp.json()
    except Exception as exc:
        log.warning("RapidAPI list call failed: %s", exc)
        return []

    results_raw = (data.get("data") or {}).get("home_search", {}).get("results") or []
    properties: list[PropertyResponse] = []

    for item in results_raw:
        try:
            loc = item.get("location", {})
            addr = loc.get("address", {})
            desc = item.get("description", {})
            coord = addr.get("coordinate", {})

            price = item.get("list_price") or 0
            beds = desc.get("beds") or 0
            baths = float(desc.get("baths") or 0)
            sqft = desc.get("sqft") or 1
            year_built = desc.get("year_built")

            ext_id = item.get("property_id") or str(uuid.uuid4())
            address = addr.get("line") or "Unknown Address"
            city_val = addr.get("city") or city
            state_val = addr.get("state_code") or state
            zip_val = addr.get("postal_code") or ""
            lat = float(coord.get("lat") or 0) or None
            lng = float(coord.get("lon") or 0) or None
            image_href = _upgrade_photo_url((item.get("primary_photo") or {}).get("href"))
            status = item.get("status") or "Active"

            # Days on market — RapidAPI sometimes ships days_on_market=0 even on
            # listings that have been up for weeks. Fall back to list_date when
            # the field is empty so the comparison modal and filters get a real
            # number.
            dom_raw = item.get("days_on_market") or 0
            days_on_market = dom_raw if dom_raw > 0 else _days_since_list_date(item.get("list_date"))

            # Basic financial estimates
            rent_mid = round(sqft * 1.2 + beds * 80 + baths * 60)
            rent_low = round(rent_mid * 0.88)
            rent_high = round(rent_mid * 1.12)
            noi_mo = rent_mid * 0.5  # ~50% expense ratio
            cap_rate = round((noi_mo * 12 / price * 100) if price > 0 else 0, 1)
            deal_score = _compute_deal_score(price, cap_rate, sqft, beds)
            risk_score = _compute_risk_score(year_built, price, sqft)

            # Fair value range — anchor around list price but skew by deal score
            # so price_vs_fair_value reflects whether the deal is over or under
            # priced. A high deal score (cheap for the area) lands below list
            # price; a low score lands above.
            fv_mid_pct = 1.0 + ((50 - deal_score) / 100) * 0.10   # ±5% range
            fair_value_mid = max(1, round(price * fv_mid_pct))
            fair_value_low = round(fair_value_mid * 0.96)
            fair_value_high = round(fair_value_mid * 1.04)
            price_vs_fv = round(((price - fair_value_mid) / fair_value_mid) * 100, 1)
            neighborhood_score = _neighborhood_score_estimate(zip_val, deal_score, risk_score)
            down = price * 0.25
            loan = price - down
            mr = 7.25 / 100 / 12
            mtg = loan * (mr * (1 + mr) ** 360) / ((1 + mr) ** 360 - 1)
            egi = rent_mid * 0.94
            opex = egi * 0.08 + price * 0.022 / 12 + 140 + price * 0.01 / 12
            cash_flow = round(egi - opex - mtg)
            coc = round(((cash_flow * 12) / (down + 8500)) * 100, 1)

            prop = PropertyResponse(
                id=ext_id,
                address=address,
                city=city_val,
                state=state_val,
                zip=zip_val,
                price=price,
                beds=beds,
                baths=baths,
                sqft=sqft,
                year_built=year_built,
                type=desc.get("type") or "Single Family",
                status=status,
                days_on_market=days_on_market,
                deal_score=deal_score,
                risk_score=risk_score,
                cap_rate=cap_rate,
                cash_on_cash=coc,
                cash_flow=cash_flow,
                fair_value_low=fair_value_low,
                fair_value_high=fair_value_high,
                rent_est_low=rent_low,
                rent_est_mid=rent_mid,
                rent_est_high=rent_high,
                rent_confidence="Low",
                valuation_confidence="Low",
                price_vs_fair_value=price_vs_fv,
                strategy_fit=round(deal_score * 0.9),
                neighborhood=None,
                neighborhood_score=neighborhood_score,
                market_regime="Balanced",
                risk_flags=[],
                image=image_href,
                lat=lat,
                lng=lng,
            )
            properties.append(prop)
        except Exception:
            continue

    # Dedupe by id — RapidAPI occasionally returns the same listing twice, which
    # would otherwise produce duplicate React keys and detail-link collisions.
    seen: set[str] = set()
    properties = [p for p in properties if not (p.id in seen or seen.add(p.id))]

    # Cache the UNFILTERED set (all results from upstream). Then filter+sort.
    try:
        cache[cache_key] = {
            "ts": time.time(),
            "data": [p.model_dump(mode="json") for p in properties],
        }
        _rapid_save(_RAPID_CACHE_FILE, cache)
    except Exception:
        pass

    return _apply_rapidapi_filters_sort(
        properties, min_deal_score, max_price, min_cap_rate, property_types, sort_by,
    )


def _apply_rapidapi_filters_sort(
    properties: list[PropertyResponse],
    min_deal_score: float | None,
    max_price: float | None,
    min_cap_rate: float | None,
    property_types: list[str] | None,
    sort_by: str | None,
) -> list[PropertyResponse]:
    if min_deal_score is not None:
        properties = [p for p in properties if p.deal_score >= min_deal_score]
    if max_price is not None:
        properties = [p for p in properties if p.price <= max_price]
    if min_cap_rate is not None:
        properties = [p for p in properties if p.cap_rate >= min_cap_rate]
    if property_types:
        properties = [p for p in properties if p.type in property_types]

    sort_map = {
        "Deal Score": (lambda p: p.deal_score, True),
        "Price": (lambda p: p.price, False),
        "Cap Rate": (lambda p: p.cap_rate, True),
        "Cash Flow": (lambda p: p.cash_flow, True),
        "Days on Market": (lambda p: p.days_on_market, False),
    }
    if sort_by and sort_by in sort_map:
        key_fn, reverse = sort_map[sort_by]
        properties.sort(key=key_fn, reverse=reverse)
    return properties


def _compute_deal_score(price: float, cap_rate: float, sqft: int, beds: int) -> float:
    score = 50.0
    score += min(30, (cap_rate - 4) * 10) if cap_rate >= 4 else (cap_rate - 4) * 10
    price_per_sqft = price / sqft if sqft > 0 else 300
    if price_per_sqft < 150:
        score += 15
    elif price_per_sqft < 200:
        score += 8
    elif price_per_sqft > 350:
        score -= 10
    if beds >= 3:
        score += 5
    return round(max(0, min(100, score)), 1)


def _compute_risk_score(year_built: int | None, price: float, sqft: int) -> float:
    score = 30.0
    if year_built:
        age = datetime.now(timezone.utc).year - year_built
        score += min(40, age * 0.8)
    price_per_sqft = price / sqft if sqft > 0 else 200
    if price_per_sqft > 400:
        score += 15
    return round(max(0, min(100, score)), 1)


def _days_since_list_date(list_date: str | None) -> int:
    """Best-effort DOM from RapidAPI's list_date when days_on_market is missing.
    Accepts ISO 8601 ("2026-05-01T00:00:00Z") and date-only ("2026-05-01") inputs."""
    if not list_date:
        return 0
    try:
        # Normalize Z suffix to +00:00 for fromisoformat
        ds = list_date.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ds)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        delta = (datetime.now(timezone.utc) - dt).days
        return max(0, delta)
    except (ValueError, TypeError):
        return 0


def _neighborhood_score_estimate(zip_val: str, deal_score: float, risk_score: float) -> int:
    """RapidAPI doesn't return a neighborhood-quality field. Derive a 0–100
    estimate so the Intelligence page, Comparison modal, and STR fit calc have
    something usable. Anchored at 65, nudged up by deal score (better deal often
    means better-priced area) and down by risk. Per-zip variance prevents every
    listing in a market from showing the same number."""
    if not zip_val:
        zip_hash = 0
    else:
        zip_hash = int(hashlib.sha1(zip_val.encode()).hexdigest(), 16) % 20  # 0–19
    base = 60 + zip_hash // 2          # 60–69 per zip
    base += int((deal_score - 50) * 0.20)  # ±10
    base -= int((risk_score - 30) * 0.10)  # ±7
    return max(40, min(95, base))
