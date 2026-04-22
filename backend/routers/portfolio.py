import uuid

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

    total_value = sum(h.current_value or 0 for h in holdings)
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
        current_value=body.current_value or body.purchase_price,
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
    db.delete(holding)


def _to_schema(h: PortfolioHolding) -> HoldingResponse:
    equity = (h.current_value or 0) - (h.loan_balance or 0)
    cash_flow = (h.monthly_rent or 0) - (h.monthly_expenses or 0)
    cap_rate = None
    if h.purchase_price and h.monthly_rent:
        annual_noi = cash_flow * 12
        cap_rate = round(annual_noi / h.purchase_price * 100, 2)
    appreciation = None
    total_return = None
    if h.purchase_price and h.current_value:
        appreciation = round((h.current_value - h.purchase_price) / h.purchase_price * 100, 2)
        cumulative_cf = cash_flow * 12  # simplified — full calc needs purchase date
        total_return = round(((h.current_value - h.purchase_price + cumulative_cf) / h.purchase_price) * 100, 2)

    return HoldingResponse(
        id=str(h.id),
        property_id=str(h.property_id) if h.property_id else None,
        address=h.address or "",
        image=h.image or "",
        status=h.status or "Active",
        purchase_price=h.purchase_price,
        purchase_date=h.purchase_date,
        current_value=h.current_value,
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
