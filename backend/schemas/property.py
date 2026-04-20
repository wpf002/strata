from typing import Literal
from . import CamelModel


class RiskFlag(CamelModel):
    label: str
    severity: Literal["High", "Medium", "Low"]


class PropertyResponse(CamelModel):
    id: str
    address: str
    city: str
    state: str
    zip: str
    price: float
    beds: int
    baths: float
    sqft: int
    lot_sqft: int | None = None
    year_built: int | None = None
    type: str
    status: str
    days_on_market: int
    deal_score: float
    risk_score: float
    cap_rate: float
    cash_on_cash: float
    cash_flow: float
    fair_value_low: float
    fair_value_high: float
    rent_est_low: float
    rent_est_high: float
    rent_est_mid: float
    rent_confidence: Literal["High", "Medium", "Low"]
    valuation_confidence: Literal["High", "Medium", "Low"]
    price_vs_fair_value: float
    strategy_fit: float
    neighborhood: str | None = None
    neighborhood_score: float | None = None
    market_regime: str | None = None
    risk_flags: list[RiskFlag] = []
    image: str | None = None
    lat: float | None = None
    lng: float | None = None


class ValuationResponse(CamelModel):
    property_id: str
    fair_value_low: float
    fair_value_high: float
    fair_value_mid: float
    confidence: Literal["High", "Medium", "Low"]
    comp_count: int
    comps: list[dict]
    adjustment_per_sqft: float = 60.0


class RiskDimension(CamelModel):
    name: str
    score: float
    description: str


class RiskResponse(CamelModel):
    property_id: str
    composite_score: float
    dimensions: list[RiskDimension]
    flags: list[RiskFlag]
