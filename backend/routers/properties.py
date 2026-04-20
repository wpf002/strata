import asyncio
import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..auth import get_optional_user
from ..database import get_db
from ..models.property import Property
from ..models.user import User
from ..schemas.property import PropertyResponse, ValuationResponse, RiskResponse
from ..services import property_service, valuation_service, risk_service
from ..services.school_service import get_nearby_schools
from ..services.rent_service import get_rent_estimate

router = APIRouter(prefix="/properties")

_OptUser = Depends(get_optional_user)


@router.get("/search", response_model=list[PropertyResponse])
async def search_properties(
    query: str | None = Query(None),
    min_deal_score: float | None = Query(None),
    max_price: float | None = Query(None),
    min_cap_rate: float | None = Query(None),
    property_types: list[str] | None = Query(None),
    sort_by: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User | None = _OptUser,
):
    return await property_service.search_properties(
        db,
        query=query,
        min_deal_score=min_deal_score,
        max_price=max_price,
        min_cap_rate=min_cap_rate,
        property_types=property_types,
        sort_by=sort_by,
    )


@router.get("/{property_id}", response_model=PropertyResponse)
async def get_property(
    property_id: str,
    db: AsyncSession = Depends(get_db),
    _: User | None = _OptUser,
):
    prop = await property_service.get_property_by_id(db, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    lat = prop.lat
    lng = prop.lng

    if lat and lng:
        flood_task = risk_service.get_flood_zone(lat, lng)
        schools_task = get_nearby_schools(lat, lng)
        rent_task = get_rent_estimate(
            address=prop.address,
            property_type=prop.type,
            beds=prop.beds,
            baths=prop.baths,
            sqft=prop.sqft,
        )
        flood, schools, rent = await asyncio.gather(flood_task, schools_task, rent_task)
        prop.flood_risk = flood
        prop.nearby_schools = schools
        prop.rent_estimate = rent
    else:
        prop.flood_risk = None
        prop.nearby_schools = None
        prop.rent_estimate = None

    return prop


@router.get("/{property_id}/comps", response_model=list[dict])
async def get_comps(
    property_id: str,
    db: AsyncSession = Depends(get_db),
    _: User | None = _OptUser,
):
    valuation = await _get_valuation_for_id(db, property_id)
    return valuation.comps


@router.get("/{property_id}/valuation", response_model=ValuationResponse)
async def get_valuation(
    property_id: str,
    db: AsyncSession = Depends(get_db),
    _: User | None = _OptUser,
):
    return await _get_valuation_for_id(db, property_id)


@router.get("/{property_id}/risk", response_model=RiskResponse)
async def get_risk(
    property_id: str,
    db: AsyncSession = Depends(get_db),
    _: User | None = _OptUser,
):
    prop = await _load_or_mock_property(db, property_id)
    risk = await risk_service.get_risk(db, prop)

    lat = prop.lat
    lng = prop.lon
    if lat and lng:
        risk.flood_risk = await risk_service.get_flood_zone(lat, lng)

    return risk


async def _get_valuation_for_id(db: AsyncSession, property_id: str) -> ValuationResponse:
    prop = await _load_or_mock_property(db, property_id)
    return await valuation_service.get_valuation(db, prop)


async def _load_or_mock_property(db: AsyncSession, property_id: str) -> Property:
    try:
        uid = _uuid.UUID(property_id)
        result = await db.execute(select(Property).where(Property.id == uid))
        prop = result.scalar_one_or_none()
        if prop:
            return prop
    except ValueError:
        pass

    mock = next(
        (p for p in property_service.MOCK_PROPERTIES if p["id"] == property_id), None
    )
    if not mock:
        raise HTTPException(status_code=404, detail="Property not found")

    return Property(
        id=_uuid.uuid4(),
        address=mock["address"],
        city=mock["city"],
        state=mock["state"],
        zip=mock["zip"],
        lat=mock.get("lat"),
        lon=mock.get("lng"),
        beds=mock["beds"],
        baths=mock["baths"],
        sqft=mock["sqft"],
        year_built=mock.get("year_built"),
        property_type=mock["type"],
        data={
            "list_price": mock["price"],
            "status": mock["status"],
            "days_on_market": mock["days_on_market"],
            "fair_value_mid": (mock["fair_value_low"] + mock["fair_value_high"]) / 2,
            **{k: mock.get(k) for k in (
                "deal_score", "risk_score", "cap_rate", "cash_on_cash",
                "cash_flow", "fair_value_low", "fair_value_high",
                "rent_est_low", "rent_est_mid", "rent_est_high",
                "rent_confidence", "valuation_confidence",
                "price_vs_fair_value", "strategy_fit",
                "neighborhood", "neighborhood_score", "market_regime",
                "risk_flags", "image", "lot_sqft",
            )},
        },
    )
