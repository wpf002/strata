from fastapi import APIRouter, HTTPException
from ..schemas.market import MarketDataResponse
from ..config import get_settings
import httpx

router = APIRouter(prefix="/market")

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
