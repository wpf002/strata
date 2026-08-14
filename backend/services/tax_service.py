"""
Property-tax rate defaults by state.

The underwriting model hardcoded `purchase_price * 0.022 / 12` for every
property. That is roughly Texas and badly wrong for most of the markets STRATA
covers — on a $342k property the difference between AZ (0.6%) and TX (1.6%) is
about $285/month, which moves NOI, cap rate, cash flow, DSCR and the buy/avoid
recommendation. Ranking deals across 25 markets with one national rate makes
low-tax states look worse than they are and high-tax states better.
"""
import json
from functools import lru_cache
from pathlib import Path

_PATH = Path(__file__).parent.parent / "data" / "property_tax.json"


@lru_cache(maxsize=1)
def _table() -> dict:
    with open(_PATH) as f:
        return json.load(f)


def default_tax_rate_pct(state: str | None) -> float:
    """
    Approximate effective annual property tax rate (percent of value) for a
    state. Falls back to the national default for unknown or missing states.

    A default, not a fact — county rates vary widely within every state.
    """
    data = _table()
    if not state:
        return data["_default"]
    return data["rates"].get(state.strip().upper(), data["_default"])


def monthly_tax(purchase_price: float, tax_rate_pct: float) -> float:
    return (purchase_price * (tax_rate_pct / 100)) / 12
