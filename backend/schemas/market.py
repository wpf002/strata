from typing import Literal
from . import CamelModel


class MarketDataResponse(CamelModel):
    geo_type: str
    geo_id: str
    city: str
    regime: Literal["Hot", "Balanced", "Cooling", "Buyer's Market"]
    median_price: float
    price_change_12mo: float
    price_change_6mo: float
    inventory: float
    days_on_market: float
    dom_change: float
    list_to_sale_ratio: float
    price_reductions: float
    cap_rate_median: float
    rent_growth_12mo: float
    vacancy_rate: float
    new_listings: int
    absorption: float


class MarketSummaryItem(CamelModel):
    city: str
    state: str
    regime: Literal["Hot", "Balanced", "Cooling", "Buyer's Market"]
    median_price: float
    price_change_12mo: float
    inventory_months: float
    days_on_market: float
    cap_rate_median: float
    rent_growth_12mo: float
    vacancy_rate: float
