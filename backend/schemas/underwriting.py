from typing import Literal
from . import CamelModel


class UnderwritingInputs(CamelModel):
    property_id: str | None = None
    purchase_price: float
    down_payment_pct: float
    interest_rate: float
    loan_type: Literal["30yr Fixed", "15yr Fixed", "Interest Only"] = "30yr Fixed"
    monthly_rent: float
    vacancy_pct: float = 5.0
    management_pct: float = 8.0
    maintenance_pct: float = 1.0
    insurance_monthly: float = 150.0
    capex_pct: float = 5.0
    strategy: str = "Buy and Hold"


class ScenarioOutput(CamelModel):
    name: Literal["Bear", "Base", "Bull"]
    cash_flow: float
    cap_rate: float
    irr: float


class UnderwritingOutputs(CamelModel):
    cash_flow: float
    cap_rate: float
    cash_on_cash: float
    dscr: float
    grm: float
    noi: float
    mortgage: float
    total_expenses: float
    effective_gross_income: float
    break_even_rent: float
    break_even_occupancy: float
    expense_ratio: float
    total_cash_to_close: float
    annual_cash_flow: float
    recommendation: Literal["Strong Buy", "Buy with Negotiation", "Marginal", "Avoid"]
    scenarios: list[ScenarioOutput]


class ScenarioSaveRequest(CamelModel):
    name: str = ""
    property_id: str | None = None
    strategy: str = "Buy and Hold"
    inputs: UnderwritingInputs
    outputs: UnderwritingOutputs


class ScenarioResponse(CamelModel):
    id: str
    name: str | None
    property_id: str | None
    strategy: str | None
    assumptions: dict
    outputs: dict
    created_at: str
