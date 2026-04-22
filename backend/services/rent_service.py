"""
Rent estimate service. Uses RentCast API when key is present; otherwise returns
a model-based estimate from property characteristics.
"""
import time
import httpx
from ..config import get_settings

_CACHE: dict[tuple, tuple[dict, float]] = {}
_CACHE_TTL = 86_400  # 24 hours — RentCast quota is precious


async def get_rent_estimate(
    address: str,
    property_type: str,
    beds: int,
    baths: float,
    sqft: int,
) -> dict:
    cache_key = (address.lower().strip(), beds, int(baths * 2), sqft)
    cached, ts = _CACHE.get(cache_key, ({}, 0.0))
    if cached and time.time() - ts < _CACHE_TTL:
        return cached

    settings = get_settings()
    result: dict | None = None
    if settings.rentcast_api_key:
        result = await _rentcast_estimate(
            settings.rentcast_api_key, address, property_type, beds, baths, sqft
        )

    out = result or _model_estimate(sqft, beds, baths)
    _CACHE[cache_key] = (out, time.time())
    return out


async def _rentcast_estimate(
    api_key: str,
    address: str,
    property_type: str,
    beds: int,
    baths: float,
    sqft: int,
) -> dict | None:
    url = "https://api.rentcast.io/v1/avm/rent/long-term"
    params = {
        "address": address,
        "propertyType": property_type,
        "bedrooms": beds,
        "bathrooms": baths,
        "squareFootage": sqft,
    }
    headers = {"X-Api-Key": api_key}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 402 or resp.status_code == 403:
                return None
            resp.raise_for_status()
            data = resp.json()
            rent_mid = data.get("rent", 0)
            rent_low = data.get("rentRangeLow", round(rent_mid * 0.88))
            rent_high = data.get("rentRangeHigh", round(rent_mid * 1.12))

            if not rent_mid:
                return None

            spread = (rent_high - rent_low) / rent_mid if rent_mid else 1
            if spread < 0.15:
                confidence = "High"
            elif spread < 0.25:
                confidence = "Medium"
            else:
                confidence = "Low"

            return {
                "rent_low": round(rent_low),
                "rent_mid": round(rent_mid),
                "rent_high": round(rent_high),
                "confidence": confidence,
                "source": "RentCast",
            }
    except Exception:
        return None


def _model_estimate(sqft: int, beds: int, baths: float) -> dict:
    estimate = sqft * 1.2
    mid = round(estimate)
    return {
        "rent_low": round(mid * 0.9),
        "rent_mid": mid,
        "rent_high": round(mid * 1.1),
        "confidence": "Low",
        "source": "Estimate",
    }
