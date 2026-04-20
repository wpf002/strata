import uuid

from fastapi import APIRouter, Depends, HTTPException
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
from ..services.underwriting_service import compute_underwriting

router = APIRouter(prefix="/underwriting")


@router.post("/calculate", response_model=UnderwritingOutputs)
async def calculate(inputs: UnderwritingInputs):
    return compute_underwriting(inputs)


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
    scenario = UnderwritingScenario(
        user_id=current_user.id,
        property_id=prop_id,
        strategy=body.strategy,
        name=body.name,
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
