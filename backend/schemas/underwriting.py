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
    # Effective annual property tax as a percent of price. When omitted, the
    # model resolves a state default (see services/tax_service.py) using
    # `state`, rather than applying one national rate to every market.
    property_tax_rate_pct: float | None = None
    state: str | None = None
    # Flat closing-cost estimate folded into cash-to-close and therefore into
    # cash-on-cash. Was an unnamed 8500 buried in three expressions.
    closing_costs: float = 8500.0


class ScenarioOutput(CamelModel):
    name: Literal["Bear", "Base", "Bull"]
    cash_flow: float
    cap_rate: float
    # Year-one total return on invested cash: cash-on-cash plus the levered
    # effect of the scenario's appreciation assumption. Previously called
    # `irr`, which it is not — a real IRR needs a multi-year cash flow series
    # and a terminal sale. `irr` is still emitted for API compatibility.
    year_one_return: float

    @property
    def irr(self) -> float:  # pragma: no cover - back-compat alias
        return self.year_one_return


class UnderwritingOutputs(CamelModel):
    cash_flow: float
    cap_rate: float
    cash_on_cash: float
    # None when there is no debt (an all-cash purchase). DSCR is undefined
    # then — it used to report 0.0, which reads as the worst possible coverage
    # for what is actually the safest possible capital structure.
    dscr: float | None
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
