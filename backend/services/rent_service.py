"""
Rent estimate service. Uses RentCast API when key is present; otherwise returns
a model-based estimate from property characteristics.
"""
import httpx
from ..config import get_settings


async def get_rent_estimate(
    zip_code: str,
    beds: int,
    baths: float,
    sqft: int,
    property_type: str = "Single Family",
) -> dict:
    settings = get_settings()

    if settings.rentcast_api_key:
        return await _rentcast_estimate(
            settings.rentcast_api_key, zip_code, beds, baths, sqft, property_type
        )

    return _model_estimate(beds, baths, sqft, property_type)


async def _rentcast_estimate(
    api_key: str,
    zip_code: str,
    beds: int,
    baths: float,
    sqft: int,
    property_type: str,
) -> dict:
    url = "https://api.rentcast.io/v1/avm/rent/long-term"
    params = {
        "zipCode": zip_code,
        "bedrooms": beds,
        "bathrooms": baths,
        "squareFootage": sqft,
        "propertyType": property_type,
    }
    headers = {"X-Api-Key": api_key}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            rent_mid = data.get("rent", 0)
            return {
                "rent_est_low": round(rent_mid * 0.90),
                "rent_est_mid": round(rent_mid),
                "rent_est_high": round(rent_mid * 1.10),
                "rent_confidence": "High",
            }
    except Exception:
        return _model_estimate(beds, baths, sqft, property_type)


def _model_estimate(beds: int, baths: float, sqft: int, property_type: str) -> dict:
    # Rough heuristic: $1.20/sqft base with bed/bath adjustments
    base = sqft * 1.20
    base += beds * 80
    base += baths * 60
    if property_type == "Condo":
        base *= 0.92
    elif property_type == "Multi-Family":
        base *= 1.10

    mid = round(base)
    return {
        "rent_est_low": round(mid * 0.88),
        "rent_est_mid": mid,
        "rent_est_high": round(mid * 1.12),
        "rent_confidence": "Low",
    }
