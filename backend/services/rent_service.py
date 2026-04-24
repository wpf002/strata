"""
Rent estimate service. Uses RentCast API when key is present; otherwise returns
a model-based estimate from property characteristics.

Quota protection:
  - Results are persisted to disk (rent_cache.json) so server restarts don't
    trigger fresh API calls for already-seen addresses.
  - A monthly call counter (rent_usage.json) stops RentCast calls once
    RENTCAST_MONTHLY_LIMIT is reached, falling back to the model estimate.
"""
import json
import time
from pathlib import Path

import httpx

from ..config import get_settings

# ── Persistent storage ────────────────────────────────────────────────────────

_DATA_DIR = Path(__file__).parent.parent / ".rentcast"
_DATA_DIR.mkdir(exist_ok=True)

_CACHE_FILE = _DATA_DIR / "rent_cache.json"
_USAGE_FILE = _DATA_DIR / "rent_usage.json"

_CACHE_TTL = 30 * 86_400      # 30 days — stable enough for mock properties
RENTCAST_MONTHLY_LIMIT = 80   # stop calling RentCast after this many hits/month


def _load_cache() -> dict:
    try:
        return json.loads(_CACHE_FILE.read_text())
    except Exception:
        return {}


def _save_cache(cache: dict) -> None:
    try:
        _CACHE_FILE.write_text(json.dumps(cache))
    except Exception:
        pass


def _load_usage() -> dict:
    try:
        return json.loads(_USAGE_FILE.read_text())
    except Exception:
        return {}


def _save_usage(usage: dict) -> None:
    try:
        _USAGE_FILE.write_text(json.dumps(usage))
    except Exception:
        pass


def clear_cache_for_testing() -> None:
    """Delete all cached data — called by test fixtures only."""
    try:
        _CACHE_FILE.unlink(missing_ok=True)
        _USAGE_FILE.unlink(missing_ok=True)
    except Exception:
        pass


def _month_key() -> str:
    t = time.gmtime()
    return f"{t.tm_year}-{t.tm_mon:02d}"


def _under_quota() -> bool:
    limit = get_settings().rentcast_monthly_limit
    if limit == 0:
        return False
    usage = _load_usage()
    return usage.get(_month_key(), 0) < limit


def get_rentcast_usage() -> dict:
    """Expose current RentCast call count for admin/usage endpoints."""
    limit = get_settings().rentcast_monthly_limit
    usage = _load_usage()
    count = usage.get(_month_key(), 0)
    return {
        "month": _month_key(),
        "calls_this_month": count,
        "limit": limit,
        "remaining": max(0, limit - count) if limit > 0 else 0,
        "enabled": limit > 0,
    }


def _increment_usage() -> None:
    usage = _load_usage()
    key = _month_key()
    usage[key] = usage.get(key, 0) + 1
    _save_usage(usage)


# ── Public API ─────────────────────────────────────────────────────────────────

async def get_rent_estimate(
    address: str,
    property_type: str,
    beds: int,
    baths: float,
    sqft: int,
) -> dict:
    cache_key = f"{address.lower().strip()}|{beds}|{int(baths * 2)}|{sqft}"
    cache = _load_cache()

    entry = cache.get(cache_key)
    if entry and time.time() - entry["ts"] < _CACHE_TTL:
        return entry["data"]

    settings = get_settings()
    result: dict | None = None

    if settings.rentcast_api_key and _under_quota():
        result = await _rentcast_estimate(
            settings.rentcast_api_key, address, property_type, beds, baths, sqft
        )
        if result:
            _increment_usage()

    out = result or _model_estimate(sqft, beds, baths)
    cache[cache_key] = {"data": out, "ts": time.time()}
    _save_cache(cache)
    return out


# ── RentCast call ──────────────────────────────────────────────────────────────

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
            if resp.status_code in (402, 403, 429):
                return None
            resp.raise_for_status()
            data = resp.json()
            rent_mid = data.get("rent", 0)
            if not rent_mid:
                return None

            rent_low = data.get("rentRangeLow", round(rent_mid * 0.88))
            rent_high = data.get("rentRangeHigh", round(rent_mid * 1.12))
            spread = (rent_high - rent_low) / rent_mid
            confidence = "High" if spread < 0.15 else "Medium" if spread < 0.25 else "Low"

            return {
                "rent_low": round(rent_low),
                "rent_mid": round(rent_mid),
                "rent_high": round(rent_high),
                "confidence": confidence,
                "source": "RentCast",
            }
    except Exception:
        return None


# ── Model fallback ─────────────────────────────────────────────────────────────

def _model_estimate(sqft: int, beds: int, baths: float) -> dict:
    mid = round(sqft * 1.2)
    return {
        "rent_low": round(mid * 0.9),
        "rent_mid": mid,
        "rent_high": round(mid * 1.1),
        "confidence": "Low",
        "source": "Estimate",
    }
