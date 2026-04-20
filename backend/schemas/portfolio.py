from datetime import date, datetime
from typing import Literal
from . import CamelModel


class HoldingCreate(CamelModel):
    property_id: str | None = None
    address: str = ""
    image: str = ""
    status: str = "Active"
    purchase_price: int
    purchase_date: date | None = None
    current_value: int | None = None
    loan_balance: int | None = None
    monthly_rent: float | None = None
    monthly_expenses: float | None = None
    recommendation: Literal["Hold", "Refi", "Sell", "Watch"] | None = None
    recommendation_note: str = ""
    notes: str | None = None


class HoldingUpdate(CamelModel):
    current_value: int | None = None
    loan_balance: int | None = None
    monthly_rent: float | None = None
    monthly_expenses: float | None = None
    status: str | None = None
    recommendation: Literal["Hold", "Refi", "Sell", "Watch"] | None = None
    recommendation_note: str | None = None
    notes: str | None = None


class HoldingResponse(CamelModel):
    id: str
    property_id: str | None
    address: str
    image: str
    status: str
    purchase_price: int
    purchase_date: date | None
    current_value: int | None
    loan_balance: int | None
    equity: int | None
    monthly_rent: float | None
    monthly_expenses: float | None
    cash_flow: float | None
    cap_rate: float | None
    appreciation: float | None
    total_return: float | None
    recommendation: str | None
    recommendation_note: str
    notes: str | None
    created_at: datetime


class PortfolioSummary(CamelModel):
    holdings: list[HoldingResponse]
    total_value: int
    total_equity: int
    total_debt: int
    total_cash_flow: float
    health_score: float
