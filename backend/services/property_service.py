"""
Property data layer. Queries the database first; if ATTOM_API_KEY is present,
enriches with live data. When no DB record exists, falls back to a mock dataset
so the API never crashes on missing API keys.
"""
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.property import Property
from ..schemas.property import PropertyResponse, RiskFlag

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
        "image": "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=600&q=80",
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
        "image": "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=600&q=80",
        "lat": 32.7957, "lng": -96.7543,
    },
    {
        "id": "p3", "address": "9034 Sunset Ridge Ln", "city": "Dallas", "state": "TX", "zip": "75218",
        "price": 419000, "beds": 4, "baths": 3.0, "sqft": 2280, "lot_sqft": 8100, "year_built": 2008,
        "type": "Single Family", "status": "Active", "days_on_market": 47,
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
        "image": "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&q=80",
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
        "image": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&q=80",
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
        "image": "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600&q=80",
        "lat": 32.7456, "lng": -96.8312,
    },
    {
        "id": "p6", "address": "3301 Harvest Glen Dr", "city": "Dallas", "state": "TX", "zip": "75234",
        "price": 312000, "beds": 3, "baths": 2.0, "sqft": 1680, "lot_sqft": 5800, "year_built": 1998,
        "type": "Single Family", "status": "Active", "days_on_market": 34,
        "deal_score": 69, "risk_score": 31, "cap_rate": 5.6, "cash_on_cash": 6.0, "cash_flow": 156,
        "fair_value_low": 298000, "fair_value_high": 326000,
        "rent_est_low": 1920, "rent_est_high": 2180, "rent_est_mid": 2050,
        "rent_confidence": "High", "valuation_confidence": "High",
        "price_vs_fair_value": -0.6, "strategy_fit": 76,
        "neighborhood": "Farmers Branch", "neighborhood_score": 67, "market_regime": "Balanced",
        "risk_flags": [{"label": "Declining school rating", "severity": "Medium"}],
        "image": "https://images.unsplash.com/photo-1598228723793-52759bba239c?w=600&q=80",
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
) -> list[PropertyResponse]:
    settings = get_settings()

    # Use RapidAPI if key is present, then ATTOM, then mock
    if settings.rapidapi_key:
        live = await _search_rapidapi(
            query, min_deal_score, max_price, min_cap_rate, property_types, sort_by,
            settings.rapidapi_key,
        )
        if live:
            return live

    if settings.attom_api_key:
        return await _search_attom(
            query, min_deal_score, max_price, min_cap_rate, property_types, sort_by
        )

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

    return [_mock_to_response(p) for p in results]


async def get_property_by_id(
    db: AsyncSession, property_id: str
) -> PropertyResponse | None:
    settings = get_settings()

    # Check DB first
    try:
        uid = uuid.UUID(property_id)
        result = await db.execute(select(Property).where(Property.id == uid))
        prop = result.scalar_one_or_none()
        if prop:
            return _db_to_response(prop)
    except ValueError:
        pass

    # Fall back to mock
    match = next((p for p in MOCK_PROPERTIES if p["id"] == property_id), None)
    if match:
        return _mock_to_response(match)

    # Try RapidAPI detail endpoint
    if settings.rapidapi_key:
        live = await _fetch_rapidapi_property(property_id, settings.rapidapi_key, db)
        if live:
            return live

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
        image=d.get("image"),
        lat=prop.lat,
        lng=prop.lon,
    )


async def _fetch_rapidapi_property(
    property_id: str, api_key: str, db: AsyncSession
) -> PropertyResponse | None:
    url = "https://realty-in-us.p.rapidapi.com/properties/v3/detail"
    headers = {
        "X-RapidAPI-Key": api_key,
        "X-RapidAPI-Host": "realty-in-us.p.rapidapi.com",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params={"property_id": property_id}, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        import logging
        logging.getLogger(__name__).warning("RapidAPI detail fetch failed for %s", property_id)
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
        image_href = (home.get("primary_photo") or {}).get("href")

        rent_mid = round(sqft * 1.2 + beds * 80 + baths * 60)
        rent_low = round(rent_mid * 0.88)
        rent_high = round(rent_mid * 1.12)
        noi_mo = rent_mid * 0.5
        cap_rate = round((noi_mo * 12 / price * 100) if price > 0 else 0, 1)
        deal_score = _compute_deal_score(price, cap_rate, sqft, beds)
        risk_score = _compute_risk_score(year_built, price, sqft)
        fair_value_low = round(price * 0.93)
        fair_value_high = round(price * 1.07)
        price_vs_fv = round(((price - (fair_value_low + fair_value_high) / 2) / ((fair_value_low + fair_value_high) / 2)) * 100, 1)
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
            days_on_market=home.get("days_on_market") or 0,
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
            neighborhood_score=None,
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
    parts = [s.strip() for s in (query or "Dallas, TX").replace(",", " ").split() if s.strip()]
    city = parts[0] if parts else "Dallas"
    state = parts[1] if len(parts) > 1 else "TX"
    zip_code = next((p for p in parts if p.isdigit() and len(p) == 5), None)

    url = "https://realty-in-us.p.rapidapi.com/properties/v3/list"
    params: dict = {
        "city": city,
        "state_code": state,
        "limit": 20,
        "offset": 0,
        "sort": "relevance",
    }
    if zip_code:
        params["postal_code"] = zip_code

    headers = {
        "X-RapidAPI-Key": api_key,
        "X-RapidAPI-Host": "realty-in-us.p.rapidapi.com",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
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
            image_href = (item.get("primary_photo") or {}).get("href")
            status = item.get("status") or "Active"
            listed_at = item.get("list_date") or ""

            # Basic financial estimates
            rent_mid = round(sqft * 1.2 + beds * 80 + baths * 60)
            rent_low = round(rent_mid * 0.88)
            rent_high = round(rent_mid * 1.12)
            noi_mo = rent_mid * 0.5  # ~50% expense ratio
            cap_rate = round((noi_mo * 12 / price * 100) if price > 0 else 0, 1)
            deal_score = _compute_deal_score(price, cap_rate, sqft, beds)
            risk_score = _compute_risk_score(year_built, price, sqft)
            fair_value_low = round(price * 0.93)
            fair_value_high = round(price * 1.07)
            price_vs_fv = round(((price - (fair_value_low + fair_value_high) / 2) / ((fair_value_low + fair_value_high) / 2)) * 100, 1)
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
                days_on_market=item.get("days_on_market") or 0,
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
                neighborhood_score=None,
                market_regime="Balanced",
                risk_flags=[],
                image=image_href,
                lat=lat,
                lng=lng,
            )
            properties.append(prop)
        except Exception:
            continue

    # Filter
    if min_deal_score is not None:
        properties = [p for p in properties if p.deal_score >= min_deal_score]
    if max_price is not None:
        properties = [p for p in properties if p.price <= max_price]
    if min_cap_rate is not None:
        properties = [p for p in properties if p.cap_rate >= min_cap_rate]

    # Sort
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
