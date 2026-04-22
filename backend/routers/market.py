import logging

from fastapi import APIRouter, HTTPException
from ..schemas.market import MarketDataResponse, MarketSummaryItem
from ..config import get_settings
import httpx

router = APIRouter(prefix="/market")
log = logging.getLogger(__name__)

_SUMMARY_CACHE: tuple[list, float] | None = None
_SUMMARY_TTL = 21_600  # 6 hours — market data doesn't change minute-to-minute

_MOCK_MARKET = {
    "city": "Dallas, TX",
    "regime": "Balanced",
    "median_price": 342000,
    "price_change_12mo": 4.2,
    "price_change_6mo": 1.8,
    "inventory": 2.3,
    "days_on_market": 28,
    "dom_change": -4,
    "list_to_sale_ratio": 97.2,
    "price_reductions": 31,
    "cap_rate_median": 5.4,
    "rent_growth_12mo": 3.1,
    "vacancy_rate": 4.8,
    "new_listings": 1840,
    "absorption": 2.3,
}


@router.get("/{geo_type}/{geo_id}", response_model=MarketDataResponse)
async def get_market(geo_type: str, geo_id: str):
    if geo_type not in ("zip", "city"):
        raise HTTPException(status_code=400, detail="geo_type must be 'zip' or 'city'")

    settings = get_settings()
    if settings.attom_api_key:
        data = await _fetch_attom_market(settings.attom_api_key, geo_type, geo_id)
        if data:
            return data

    # Graceful fallback — mock data stamped with requested geo
    label = geo_id if geo_type == "city" else f"ZIP {geo_id}"
    return MarketDataResponse(geo_type=geo_type, geo_id=geo_id, **{**_MOCK_MARKET, "city": label})


_BASELINE_MARKETS = [
    {"city": "Dallas", "state": "TX", "median_price": 342000, "price_change_12mo": 4.2,
     "inventory_months": 2.3, "days_on_market": 28, "cap_rate_median": 5.4,
     "rent_growth_12mo": 3.1, "vacancy_rate": 4.8},
    {"city": "Phoenix", "state": "AZ", "median_price": 415000, "price_change_12mo": 2.8,
     "inventory_months": 2.9, "days_on_market": 35, "cap_rate_median": 5.0,
     "rent_growth_12mo": 2.4, "vacancy_rate": 5.2},
    {"city": "Nashville", "state": "TN", "median_price": 468000, "price_change_12mo": 1.2,
     "inventory_months": 3.7, "days_on_market": 42, "cap_rate_median": 4.8,
     "rent_growth_12mo": 2.8, "vacancy_rate": 5.8},
    {"city": "Atlanta", "state": "GA", "median_price": 358000, "price_change_12mo": 5.6,
     "inventory_months": 1.7, "days_on_market": 22, "cap_rate_median": 5.8,
     "rent_growth_12mo": 4.2, "vacancy_rate": 4.2},
    {"city": "Tampa", "state": "FL", "median_price": 392000, "price_change_12mo": -0.8,
     "inventory_months": 4.2, "days_on_market": 56, "cap_rate_median": 5.1,
     "rent_growth_12mo": 0.6, "vacancy_rate": 7.1},
]


def _compute_regime(inventory: float, price_change: float) -> str:
    if inventory < 2.0:
        return "Hot"
    if 2.0 <= inventory <= 3.5 and price_change > 2.0:
        return "Balanced"
    if inventory > 5.0:
        return "Buyer's Market"
    if inventory > 3.5 or price_change < 0:
        return "Cooling"
    return "Balanced"


async def _fetch_rentcast_market(city: str, state: str, api_key: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.rentcast.io/v1/markets",
                params={"city": city, "state": state, "dataType": "All"},
                headers={"X-Api-Key": api_key, "Accept": "application/json"},
            )
            if not resp.is_success:
                return None
            data = resp.json()
            if not data:
                return None
            rent_growth = data.get("rentGrowthYtd") or data.get("rentGrowth1yr") or 0
            avg_rent = data.get("averageRent") or 0
            return {"rent_growth_12mo": round(float(rent_growth), 1), "avg_rent": avg_rent}
    except Exception:
        log.warning("RentCast market fetch failed for %s, %s", city, state)
        return None


@router.get("/summary", response_model=list[MarketSummaryItem])
async def get_market_summary():
    global _SUMMARY_CACHE
    import time
    if _SUMMARY_CACHE is not None:
        cached, ts = _SUMMARY_CACHE
        if time.time() - ts < _SUMMARY_TTL:
            return cached

    settings = get_settings()
    results: list[MarketSummaryItem] = []

    for b in _BASELINE_MARKETS:
        rent_growth = b["rent_growth_12mo"]
        if settings.rentcast_api_key:
            rc = await _fetch_rentcast_market(b["city"], b["state"], settings.rentcast_api_key)
            if rc and rc.get("rent_growth_12mo") is not None:
                rent_growth = rc["rent_growth_12mo"]

        regime = _compute_regime(b["inventory_months"], b["price_change_12mo"])
        results.append(MarketSummaryItem(
            city=b["city"],
            state=b["state"],
            regime=regime,
            median_price=b["median_price"],
            price_change_12mo=b["price_change_12mo"],
            inventory_months=b["inventory_months"],
            days_on_market=b["days_on_market"],
            cap_rate_median=b["cap_rate_median"],
            rent_growth_12mo=rent_growth,
            vacancy_rate=b["vacancy_rate"],
        ))

    _SUMMARY_CACHE = (results, time.time())
    return results


async def _fetch_attom_market(
    api_key: str, geo_type: str, geo_id: str
) -> MarketDataResponse | None:
    try:
        headers = {"apikey": api_key, "Accept": "application/json"}
        params = {"zipcode": geo_id} if geo_type == "zip" else {"address2": geo_id}
        url = "https://api.gateway.attomdata.com/propertyapi/v1.0.0/sale/snapshot"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers, params=params)
            if not resp.is_success:
                return None
            # Map ATTOM response fields → MarketDataResponse
            # (field mapping depends on ATTOM subscription tier)
            return None
    except Exception:
        return None
