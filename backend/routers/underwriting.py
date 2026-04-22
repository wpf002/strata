import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..auth import get_current_user
from ..database import get_db
from ..models.portfolio import UnderwritingScenario
from ..models.user import User
from ..schemas.underwriting import (
    UnderwritingInputs,
    UnderwritingOutputs,
    ScenarioSaveRequest,
    ScenarioResponse,
)
from ..services.underwriting_service import (
    compute_underwriting,
    brrrr_analysis,
    flip_analysis,
    str_analysis,
)

router = APIRouter(prefix="/underwriting")


@router.post("/calculate", response_model=UnderwritingOutputs)
async def calculate(inputs: UnderwritingInputs):
    return compute_underwriting(inputs)


# ── BRRRR ─────────────────────────────────────────────────────────────────────

class BrrrrRequest(BaseModel):
    base: UnderwritingInputs
    rehab_cost: float
    arv: float
    refi_ltv_pct: float = 75.0
    refi_rate: float = 7.0


@router.post("/brrrr")
async def calculate_brrrr(body: BrrrrRequest):
    return brrrr_analysis(
        base=body.base,
        rehab_cost=body.rehab_cost,
        arv=body.arv,
        refi_ltv_pct=body.refi_ltv_pct,
        refi_rate=body.refi_rate,
    )


# ── Flip ──────────────────────────────────────────────────────────────────────

class FlipRequest(BaseModel):
    purchase_price: float
    rehab_cost: float
    arv: float
    hold_months: int = 6
    financing_rate: float = 0.12
    agent_commission_pct: float = 0.055


@router.post("/flip")
async def calculate_flip(body: FlipRequest):
    return flip_analysis(
        purchase_price=body.purchase_price,
        rehab_cost=body.rehab_cost,
        arv=body.arv,
        hold_months=body.hold_months,
        financing_rate=body.financing_rate,
        agent_commission_pct=body.agent_commission_pct,
    )


# ── STR ───────────────────────────────────────────────────────────────────────

class StrRequest(BaseModel):
    base: UnderwritingInputs
    nightly_rate_low: float
    nightly_rate_mid: float
    nightly_rate_high: float
    occupancy_low: float = 0.55
    occupancy_mid: float = 0.70
    occupancy_high: float = 0.82
    platform_fee_pct: float = 0.03
    cleaning_fee_per_stay: float = 120.0
    avg_stay_nights: float = 3.5


@router.post("/str")
async def calculate_str(body: StrRequest):
    return str_analysis(
        base=body.base,
        nightly_rate_low=body.nightly_rate_low,
        nightly_rate_mid=body.nightly_rate_mid,
        nightly_rate_high=body.nightly_rate_high,
        occupancy_low=body.occupancy_low,
        occupancy_mid=body.occupancy_mid,
        occupancy_high=body.occupancy_high,
        platform_fee_pct=body.platform_fee_pct,
        cleaning_fee_per_stay=body.cleaning_fee_per_stay,
        avg_stay_nights=body.avg_stay_nights,
    )


# ── Scenarios ─────────────────────────────────────────────────────────────────

@router.get("/scenarios", response_model=list[ScenarioResponse])
async def list_scenarios(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UnderwritingScenario)
        .where(UnderwritingScenario.user_id == current_user.id)
        .order_by(UnderwritingScenario.created_at.desc())
    )
    rows = result.scalars().all()
    return [_row_to_schema(r) for r in rows]


@router.post("/scenarios", response_model=ScenarioResponse, status_code=201)
async def save_scenario(
    body: ScenarioSaveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prop_id = uuid.UUID(body.property_id) if body.property_id else None
    name = body.name or f"{body.strategy} — ${body.inputs.purchase_price:,.0f}"
    scenario = UnderwritingScenario(
        user_id=current_user.id,
        property_id=prop_id,
        strategy=body.strategy,
        name=name,
        assumptions=body.inputs.model_dump(),
        outputs=body.outputs.model_dump(),
    )
    db.add(scenario)
    await db.flush()
    return _row_to_schema(scenario)


@router.get("/scenarios/{scenario_id}", response_model=ScenarioResponse)
async def get_scenario(
    scenario_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UnderwritingScenario).where(
            UnderwritingScenario.id == scenario_id,
            UnderwritingScenario.user_id == current_user.id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return _row_to_schema(row)


def _row_to_schema(row: UnderwritingScenario) -> ScenarioResponse:
    return ScenarioResponse(
        id=str(row.id),
        name=row.name,
        property_id=str(row.property_id) if row.property_id else None,
        strategy=row.strategy,
        assumptions=row.assumptions,
        outputs=row.outputs,
        created_at=row.created_at.isoformat(),
    )
