import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..auth import get_current_user
from ..database import get_db
from ..models.portfolio import PortfolioHolding
from ..models.user import User
from ..schemas.portfolio import (
    HoldingCreate,
    HoldingUpdate,
    HoldingResponse,
    PortfolioSummary,
)

router = APIRouter(prefix="/portfolio")

# Long-run residential SFH appreciation (~3% / yr). Used to estimate current
# value when no live AVM is available — better than showing 0% appreciation for
# every holding because purchase_price was copied into current_value at create.
DEFAULT_APPRECIATION_RATE = 0.03


def _estimated_current_value(h: PortfolioHolding) -> int | None:
    """Best-effort current value when none was explicitly set.

    Returns None when there's not enough signal (no purchase_date) — the response
    schema then surfaces appreciation as null and the UI shows "—".
    """
    if h.current_value and h.current_value != h.purchase_price:
        return h.current_value
    if not h.purchase_date or not h.purchase_price:
        return h.current_value  # might still be the seed purchase_price
    now = datetime.now(timezone.utc)
    purchase_dt = datetime.combine(h.purchase_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    years = max(0.0, (now - purchase_dt).days / 365.25)
    if years < 0.08:  # < ~1 month — no appreciation signal yet
        return h.current_value
    return round(h.purchase_price * ((1 + DEFAULT_APPRECIATION_RATE) ** years))


@router.get("", response_model=PortfolioSummary)
async def get_portfolio(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PortfolioHolding).where(PortfolioHolding.user_id == current_user.id)
    )
    holdings = result.scalars().all()
    responses = [_to_schema(h) for h in holdings]

    total_value = sum(_estimated_current_value(h) or 0 for h in holdings)
    total_debt = sum(h.loan_balance or 0 for h in holdings)
    total_equity = total_value - total_debt
    total_cf = sum((h.monthly_rent or 0) - (h.monthly_expenses or 0) for h in holdings)

    return PortfolioSummary(
        holdings=responses,
        total_value=total_value,
        total_equity=total_equity,
        total_debt=total_debt,
        total_cash_flow=total_cf,
        health_score=_health_score(responses),
    )


@router.post("/holdings", response_model=HoldingResponse, status_code=201)
async def add_holding(
    body: HoldingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop_id = uuid.UUID(body.property_id) if body.property_id else None
    holding = PortfolioHolding(
        user_id=current_user.id,
        property_id=prop_id,
        address=body.address,
        image=body.image,
        status=body.status,
        recommendation_note=body.recommendation_note,
        purchase_price=body.purchase_price,
        purchase_date=body.purchase_date,
        # current_value left None when not provided so appreciation can be
        # computed from purchase_date + market growth at read time. Forcing it
        # to purchase_price here would lock appreciation at 0% forever.
        current_value=body.current_value,
        loan_balance=body.loan_balance,
        monthly_rent=body.monthly_rent,
        monthly_expenses=body.monthly_expenses,
        recommendation=body.recommendation,
        notes=body.notes,
    )
    db.add(holding)
    await db.flush()
    return _to_schema(holding)


@router.put("/holdings/{holding_id}", response_model=HoldingResponse)
async def update_holding(
    holding_id: uuid.UUID,
    body: HoldingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PortfolioHolding).where(
            PortfolioHolding.id == holding_id,
            PortfolioHolding.user_id == current_user.id,
        )
    )
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(holding, field, value)
    await db.flush()
    return _to_schema(holding)


@router.delete("/holdings/{holding_id}", status_code=204)
async def delete_holding(
    holding_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PortfolioHolding).where(
            PortfolioHolding.id == holding_id,
            PortfolioHolding.user_id == current_user.id,
        )
    )
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    await db.delete(holding)


def _to_schema(h: PortfolioHolding) -> HoldingResponse:
    current_value = _estimated_current_value(h) or h.current_value
    equity = (current_value or 0) - (h.loan_balance or 0)
    cash_flow = (h.monthly_rent or 0) - (h.monthly_expenses or 0)
    cap_rate = None
    if h.purchase_price and h.monthly_rent:
        annual_noi = cash_flow * 12
        cap_rate = round(annual_noi / h.purchase_price * 100, 2)
    # Surface appreciation only when current_value differs meaningfully from the
    # purchase price. Identical values mean no AVM data was set, so the response
    # carries null and the UI renders "—" rather than a misleading 0%.
    appreciation = None
    total_return = None
    if h.purchase_price and current_value and current_value != h.purchase_price:
        appreciation = round((current_value - h.purchase_price) / h.purchase_price * 100, 2)
        cumulative_cf = cash_flow * 12  # simplified — full calc needs purchase date
        total_return = round(((current_value - h.purchase_price + cumulative_cf) / h.purchase_price) * 100, 2)

    return HoldingResponse(
        id=str(h.id),
        property_id=str(h.property_id) if h.property_id else None,
        address=h.address or "",
        image=h.image or "",
        status=h.status or "Active",
        purchase_price=h.purchase_price,
        purchase_date=h.purchase_date,
        current_value=current_value,
        loan_balance=h.loan_balance,
        equity=equity,
        monthly_rent=h.monthly_rent,
        monthly_expenses=h.monthly_expenses,
        cash_flow=cash_flow,
        cap_rate=cap_rate,
        appreciation=appreciation,
        total_return=total_return,
        recommendation=h.recommendation,
        recommendation_note=h.recommendation_note or "",
        notes=h.notes,
        created_at=h.created_at,
    )


def _health_score(holdings: list[HoldingResponse]) -> float:
    if not holdings:
        return 0.0

    # Up to 40 pts: positive cash flow across portfolio
    positive = sum(1 for h in holdings if (h.cash_flow or 0) > 0)
    cf_pts = (positive / len(holdings)) * 40

    # Up to 20 pts: geographic diversity — penalize >50% concentration in one state
    from collections import Counter
    def _state(addr: str) -> str:
        parts = [p.strip() for p in addr.split(",")]
        for part in reversed(parts):
            tokens = part.split()
            for tok in tokens:
                if len(tok) == 2 and tok.isupper():
                    return tok
        return "Unknown"

    state_counts = Counter(_state(h.address) for h in holdings)
    max_pct = max(state_counts.values()) / len(holdings)
    if max_pct <= 0.50:
        geo_pts = 20.0
    else:
        geo_pts = max(0.0, 20.0 * (1 - (max_pct - 0.50) * 4))

    # Up to 20 pts: average LTV below 75%
    ltv_values = []
    for h in holdings:
        cv = h.current_value or 0
        lb = h.loan_balance or 0
        if cv > 0:
            ltv_values.append(lb / cv)
    if ltv_values:
        avg_ltv = sum(ltv_values) / len(ltv_values)
        ltv_pts = 20.0 if avg_ltv <= 0.75 else max(0.0, 20.0 * (1 - (avg_ltv - 0.75) * 4))
    else:
        ltv_pts = 10.0

    # Up to 20 pts: 3+ properties
    size_pts = min(20.0, (len(holdings) / 3) * 20.0)

    return round(min(100.0, cf_pts + geo_pts + ltv_pts + size_pts), 1)


# ── Hold / Sell / Refi Engine ─────────────────────────────────────────────────

@router.post("/holdings/{holding_id}/analysis")
async def holding_analysis(
    holding_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PortfolioHolding).where(
            PortfolioHolding.id == holding_id,
            PortfolioHolding.user_id == current_user.id,
        )
    )
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Holding not found")

    current_value = h.current_value or h.purchase_price
    loan_balance = h.loan_balance or 0
    purchase_price = h.purchase_price
    monthly_rent = h.monthly_rent or 0
    monthly_expenses = h.monthly_expenses or 0
    cash_flow = monthly_rent - monthly_expenses

    ltv = loan_balance / current_value if current_value else 1.0
    appreciation_pct = ((current_value - purchase_price) / purchase_price) if purchase_price else 0.0

    # Simplified market rate assumption (no live data)
    market_rate = 0.07
    original_rate = 0.065

    # NOI and DSCR
    annual_noi = cash_flow * 12
    annual_debt_service = _annual_debt_service(loan_balance, original_rate, 30)
    current_dscr = annual_noi / annual_debt_service if annual_debt_service > 0 else 0.0

    # SELL signals
    sell_signals: list[str] = []
    if current_value > purchase_price * 1.25:
        sell_signals.append(f"Appreciated {appreciation_pct*100:.1f}% above purchase price (>25% threshold)")
    if cash_flow < 0:
        sell_signals.append("Negative cash flow — property is costing money each month")
    if ltv < 0.40:
        sell_signals.append(f"LTV at {ltv*100:.0f}% — significant equity to harvest")

    # REFI signals
    refi_signals: list[str] = []
    if 0.55 <= ltv <= 0.70:
        refi_signals.append(f"LTV at {ltv*100:.0f}% — within cash-out refi sweet spot (55–70%)")
    if original_rate - market_rate >= 0.005:
        refi_signals.append(
            f"Current rate ({original_rate*100:.2f}%) is {(original_rate-market_rate)*100:.2f}% above market"
        )
    if appreciation_pct >= 0.15:
        refi_signals.append(f"Appreciated {appreciation_pct*100:.1f}% — equity available to pull out")

    # Check post-refi DSCR
    new_loan = current_value * 0.75
    new_debt_service = _annual_debt_service(new_loan, market_rate, 30)
    new_dscr = annual_noi / new_debt_service if new_debt_service > 0 else 0.0
    if new_dscr >= 1.20:
        refi_signals.append(f"Post-refi DSCR would be {new_dscr:.2f}x — still serviceable")

    # Decision
    if len(sell_signals) >= 2:
        rec = "Sell"
        confidence = "High" if len(sell_signals) >= 3 else "Medium"
        signals = sell_signals
        agent_fees = current_value * 0.06
        cap_gains_rate = 0.15 if appreciation_pct > 0 else 0.0
        capital_gain = max(0, current_value - purchase_price)
        taxes = capital_gain * cap_gains_rate
        net_proceeds = current_value - loan_balance - agent_fees - taxes
        rationale = (
            f"Based on {len(sell_signals)} sell signals, disposing of this asset now appears optimal. "
            f"Estimated net proceeds after agent fees and estimated capital gains taxes: "
            f"${net_proceeds:,.0f}. Proceeds could be redeployed into a higher-yield opportunity "
            f"or a 1031 exchange to defer taxes."
        )
        return {
            "recommendation": rec,
            "confidence": confidence,
            "rationale": rationale,
            "signalsTriggered": signals,
            "estimatedNetProceeds": round(net_proceeds),
            "estimatedCapGains": round(capital_gain),
            "suggestedListingPriceLow": round(current_value * 0.97),
            "suggestedListingPriceHigh": round(current_value * 1.03),
        }

    elif len(refi_signals) >= 2:
        rec = "Refi"
        confidence = "High" if len(refi_signals) >= 3 else "Medium"
        signals = refi_signals
        cash_out = max(0, new_loan - loan_balance)
        new_monthly_payment = (new_loan * (market_rate / 12)) / (1 - (1 + market_rate / 12) ** -360)
        breakeven = int((new_monthly_payment - (annual_debt_service / 12)) * 12 / max(1, cash_out) * 12) if cash_out > 0 else 0
        rationale = (
            f"A cash-out refinance at current market rates (~{market_rate*100:.2f}%) could unlock "
            f"${cash_out:,.0f} in equity while maintaining a DSCR of {new_dscr:.2f}x. "
            f"New monthly payment would be ${new_monthly_payment:,.0f}. "
            f"Use cash-out proceeds to fund the next acquisition."
        )
        return {
            "recommendation": rec,
            "confidence": confidence,
            "rationale": rationale,
            "signalsTriggered": signals,
            "estimatedNewLoan": round(new_loan),
            "estimatedCashOut": round(cash_out),
            "newMonthlyPayment": round(new_monthly_payment),
            "newDscr": round(new_dscr, 2),
            "breakevenMonths": max(0, breakeven),
        }

    else:
        rec = "Hold"
        confidence = "High" if cash_flow > 0 else "Medium"
        signals = []
        if cash_flow > 0:
            signals.append(f"Positive cash flow of ${cash_flow:,.0f}/mo")
        if ltv > 0.70:
            signals.append(f"LTV at {ltv*100:.0f}% — refinancing not yet optimal")
        if not signals:
            signals.append("No strong sell or refi signals identified at current market conditions")

        proj_equity_12 = (current_value * 1.04) - loan_balance
        proj_equity_36 = (current_value * 1.12) - loan_balance
        trigger = "Re-evaluate when appreciation exceeds 25% or LTV drops below 55%"

        rationale = (
            f"With a DSCR of {current_dscr:.2f}x and LTV of {ltv*100:.0f}%, holding remains the "
            f"optimal strategy. The property is generating ${cash_flow:,.0f}/mo in net cash flow. "
            f"Projected equity in 12 months (4% appreciation): ${proj_equity_12:,.0f}."
        )
        return {
            "recommendation": rec,
            "confidence": confidence,
            "rationale": rationale,
            "signalsTriggered": signals,
            "projectedEquity12Mo": round(proj_equity_12),
            "projectedEquity36Mo": round(proj_equity_36),
            "nextReviewTrigger": trigger,
        }


def _annual_debt_service(loan: float, rate: float, years: int) -> float:
    if loan <= 0 or rate <= 0:
        return 0.0
    monthly_rate = rate / 12
    n = years * 12
    monthly = loan * monthly_rate / (1 - (1 + monthly_rate) ** -n)
    return monthly * 12


# ── Tax Analysis ──────────────────────────────────────────────────────────────

@router.post("/holdings/{holding_id}/tax-analysis")
async def holding_tax_analysis(
    holding_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PortfolioHolding).where(
            PortfolioHolding.id == holding_id,
            PortfolioHolding.user_id == current_user.id,
        )
    )
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Holding not found")

    purchase_price = h.purchase_price
    current_value = h.current_value or purchase_price

    # Years held
    if h.purchase_date:
        purchase_dt = datetime.combine(h.purchase_date, datetime.min.time()).replace(tzinfo=timezone.utc)
        years_held = max(0, (datetime.now(timezone.utc) - purchase_dt).days / 365.25)
    else:
        years_held = 1.0

    # Depreciation (residential: 27.5 year straight-line on 80% of value)
    depreciable_basis = purchase_price * 0.80
    annual_depreciation = depreciable_basis / 27.5
    accumulated_depreciation = annual_depreciation * min(years_held, 27.5)

    # Capital gains if sold today
    agent_fees = current_value * 0.06
    gross_proceeds = current_value
    adjusted_basis = purchase_price - accumulated_depreciation
    capital_gain = max(0, gross_proceeds - agent_fees - adjusted_basis)

    # Tax rates
    ltcg_rate = 0.20 if purchase_price > 500_000 else 0.15
    federal_ltcg_tax = capital_gain * ltcg_rate if years_held >= 1 else capital_gain * 0.37
    depreciation_recapture_tax = min(accumulated_depreciation, gross_proceeds - adjusted_basis) * 0.25
    state_tax_estimate = capital_gain * 0.05  # blended estimate
    net_after_tax = gross_proceeds - agent_fees - federal_ltcg_tax - depreciation_recapture_tax - state_tax_estimate

    # 1031 eligibility
    qualifies = years_held >= 1.0
    today = date.today()
    from datetime import timedelta
    id_deadline = (today + timedelta(days=45)).isoformat()
    exchange_deadline = (today + timedelta(days=180)).isoformat()

    # Cost segregation
    cost_seg_applicable = current_value > 500_000
    year1_bonus = current_value * 0.15 if cost_seg_applicable else 0.0  # estimate

    return {
        "annualDepreciation": round(annual_depreciation),
        "accumulatedDepreciation": round(accumulated_depreciation),
        "depreciationRecaptureOnSale": round(min(accumulated_depreciation, max(0, gross_proceeds - adjusted_basis)) * 0.25),
        "grossProceeds": round(gross_proceeds),
        "agentFees": round(agent_fees),
        "adjustedBasis": round(adjusted_basis),
        "capitalGain": round(capital_gain),
        "federalLtcgTax": round(federal_ltcg_tax),
        "depreciationRecaptureTax": round(depreciation_recapture_tax),
        "statesTaxEstimate": round(state_tax_estimate),
        "netAfterTaxProceeds": round(net_after_tax),
        "yearsHeld": round(years_held, 1),
        "qualifiesFor1031": qualifies,
        "identificationDeadline": id_deadline,
        "exchangeDeadline": exchange_deadline,
        "minReplacementValue": round(gross_proceeds),
        "costSegregationApplicable": cost_seg_applicable,
        "estimatedYear1BonusDepreciation": round(year1_bonus),
        "disclaimer": (
            "Estimates only. Tax calculations use simplified assumptions and do not account for "
            "your specific tax situation, state laws, or all applicable deductions. "
            "Consult a licensed CPA or tax attorney before making any tax decisions."
        ),
    }
