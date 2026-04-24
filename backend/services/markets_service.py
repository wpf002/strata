"""
Supported-markets registry. Loaded once from backend/data/markets.json.

Each market entry:
  {
    market_id: "dallas-tx",
    city: "Dallas",
    state: "TX",
    state_code: "TX",
    is_launch_market: bool
  }
"""
import json
from functools import lru_cache
from pathlib import Path

_MARKETS_PATH = Path(__file__).parent.parent / "data" / "markets.json"


@lru_cache
def load_markets() -> dict[str, dict]:
    with _MARKETS_PATH.open() as f:
        return json.load(f)


def list_markets() -> list[dict]:
    """Return all markets as a list of frontend-shaped dicts."""
    markets = load_markets()
    return [
        {
            "marketId": mid,
            "city": m["city"],
            "state": m["state"],
            "stateCode": m["state_code"],
            "isLaunchMarket": m.get("is_launch_market", False),
        }
        for mid, m in sorted(markets.items(), key=lambda kv: (not kv[1].get("is_launch_market", False), kv[1]["city"]))
    ]


def resolve_market(query: str | None) -> dict | None:
    """Map a freeform user query ("Phoenix AZ", "Dallas, TX", "austin-tx") to a market.

    Returns None if no match.
    """
    if not query:
        return None
    markets = load_markets()

    # Exact market_id match
    key = query.strip().lower().replace(",", "").replace(" ", "-")
    if key in markets:
        m = markets[key]
        return {"market_id": key, **m}

    # City + state match (any order, case-insensitive)
    parts = [p.strip().lower() for p in query.replace(",", " ").split() if p.strip()]
    for mid, m in markets.items():
        city_tokens = m["city"].lower().split()
        state_tokens = [m["state"].lower(), m["state_code"].lower()]
        has_city = all(tok in parts for tok in city_tokens) or any(tok in parts for tok in city_tokens)
        has_state = any(tok in parts for tok in state_tokens)
        if has_city and has_state:
            return {"market_id": mid, **m}

    # City-only fallback
    for mid, m in markets.items():
        if m["city"].lower() in parts or m["city"].lower() == query.strip().lower():
            return {"market_id": mid, **m}

    return None
