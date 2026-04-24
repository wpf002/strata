import asyncio
import uuid as _uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from ..auth import get_optional_user
from ..database import get_db
from ..models.property import Property
from ..models.user import User
from ..schemas.property import PropertyResponse, ValuationResponse, RiskResponse
from ..services import property_service, valuation_service, risk_service, off_market_service, renovation_service, demand_service
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
    off_market_only: bool = Query(False),
    min_motivation_score: int | None = Query(None, ge=0, le=100),
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
        off_market_only=off_market_only,
        min_motivation_score=min_motivation_score,
    )


@router.get("/demand-signals")
async def get_demand_signals_batch(
    ids: str = Query(..., description="Comma-separated property IDs"),
    db: AsyncSession = Depends(get_db),
    _: User | None = _OptUser,
):
    """Batch demand signal lookup — used by the search page to decorate cards
    with a High-Demand badge and power the Competition sort. Returns a map
    keyed by propertyId; missing ids get a zero score."""
    property_ids = [pid.strip() for pid in ids.split(",") if pid.strip()]
    signals = await demand_service.get_demand_signals_bulk(db, property_ids)
    # Ensure every requested id is present in the response.
    return {
        pid: signals.get(pid, {"propertyId": pid, "demandScore": 0, "demandLabel": "Low — limited investor activity"})
        for pid in property_ids
    }


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

    # Prefer raw mock source data when available — richer fields for signal detection.
    mock_source = next((m for m in property_service.MOCK_PROPERTIES if m["id"] == prop.id), None)
    signals = off_market_service.compute_signals(mock_source or prop.model_dump())
    prop.motivation_score = signals["motivation_score"]
    from ..schemas.property import OffMarketSignal as _OMS
    prop.off_market_signals = (
        [_OMS(**s) for s in signals["signals"]] if signals["has_signals"] else []
    )

    return prop


@router.get("/{property_id}/off-market-signals")
async def get_off_market_signals(
    property_id: str,
    db: AsyncSession = Depends(get_db),
    _: User | None = _OptUser,
):
    # Mock ids (p1, p2…) carry the richer fields signal detection needs —
    # prefer the raw mock dict over a narrowed PropertyResponse.
    mock = next((p for p in property_service.MOCK_PROPERTIES if p["id"] == property_id), None)
    if mock:
        return off_market_service.compute_signals(mock)

    prop = await property_service.get_property_by_id(db, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return off_market_service.compute_signals(prop.model_dump())


@router.get("/{property_id}/comps", response_model=list[dict])
async def get_comps(
    property_id: str,
    db: AsyncSession = Depends(get_db),
    _: User | None = _OptUser,
):
    valuation = await _get_valuation_for_id(db, property_id)
    return valuation.comps


@router.get("/{property_id}/demand")
async def get_property_demand(
    property_id: str,
    db: AsyncSession = Depends(get_db),
    _: User | None = _OptUser,
):
    """Demand signal for a single property — distinct-user counts, composite
    score, and a plain-English insight note for the Intelligence page."""
    return await demand_service.get_demand_signal(db, property_id)


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


# ── Offer Analysis ────────────────────────────────────────────────────────────

class OfferAnalysisRequest(BaseModel):
    list_price: float
    down_payment_pct: float = 25.0
    strategy: str = "Long-Term Rental"
    urgency: Literal["low", "medium", "high"] = "medium"


@router.post("/{property_id}/offer-analysis")
async def offer_analysis(
    property_id: str,
    body: OfferAnalysisRequest,
    db: AsyncSession = Depends(get_db),
    _: User | None = _OptUser,
):
    prop = await _load_or_mock_property(db, property_id)

    mock = next((p for p in property_service.MOCK_PROPERTIES if p["id"] == property_id), None)
    days_on_market: int = mock.get("days_on_market", 30) if mock else 30
    market_regime: str = mock.get("market_regime", "Balanced") if mock else "Balanced"
    has_price_reduction: bool = mock.get("has_price_reduction", False) if mock else False

    # AVM fair value mid
    fair_value_low = (mock or {}).get("fair_value_low", body.list_price * 0.97)
    fair_value_high = (mock or {}).get("fair_value_high", body.list_price * 1.03)
    base = (fair_value_low + fair_value_high) / 2

    # DOM adjustment
    if days_on_market > 90:
        base *= 0.95
    elif days_on_market > 60:
        base *= 0.97
    elif days_on_market < 14:
        base *= 1.01

    # Price reduction signal
    if has_price_reduction:
        base *= 0.98

    # Market regime
    if market_regime == "Hot":
        base *= 1.02
    elif market_regime == "Buyer's Market":
        base *= 0.96

    # Urgency adjustment to recommended offer
    urgency_adj = {"low": 0.97, "medium": 0.97, "high": 0.99}[body.urgency]

    offer_low = base * 0.94
    offer_mid = base * 0.97
    offer_high = base * 1.00
    recommended_offer = offer_mid * urgency_adj if body.urgency != "high" else offer_high

    # Acceptance probability
    spread = (body.list_price - recommended_offer) / body.list_price
    if spread <= 0.01:
        probability = 0.85
    elif spread <= 0.03:
        probability = 0.72
    elif spread <= 0.06:
        probability = 0.55
    elif spread <= 0.10:
        probability = 0.38
    else:
        probability = 0.20

    list_to_sale_ratio = 0.972  # Dallas market baseline
    comparable_sales_used = mock.get("comp_count", 9) if mock else 9

    negotiation_notes = _build_negotiation_notes(
        days_on_market=days_on_market,
        market_regime=market_regime,
        has_price_reduction=has_price_reduction,
        list_price=body.list_price,
        recommended=recommended_offer,
        urgency=body.urgency,
    )

    strategy_notes = _build_strategy_notes(body.strategy, body.urgency, days_on_market)

    return {
        "offerLow": round(offer_low, -2),
        "offerMid": round(offer_mid, -2),
        "offerHigh": round(offer_high, -2),
        "recommendedOffer": round(recommended_offer, -2),
        "acceptanceProbability": round(probability, 2),
        "negotiationNotes": negotiation_notes,
        "comparableSalesUsed": comparable_sales_used,
        "daysOnMarket": days_on_market,
        "listToSaleRatio": list_to_sale_ratio,
        "strategyNotes": strategy_notes,
    }


def _build_negotiation_notes(
    days_on_market: int,
    market_regime: str,
    has_price_reduction: bool,
    list_price: float,
    recommended: float,
    urgency: str,
) -> str:
    parts = []
    if days_on_market > 60:
        parts.append(f"Property has been on market {days_on_market} days — seller may be motivated.")
    if has_price_reduction:
        parts.append("A prior price reduction signals flexibility.")
    if market_regime == "Buyer's Market":
        parts.append("Buyer's market conditions favor a below-ask offer.")
    elif market_regime == "Hot":
        parts.append("Competitive market — expect multiple offers; come in strong.")
    gap = list_price - recommended
    if gap > 0:
        parts.append(f"Recommended offer is ${gap:,.0f} below list price.")
    if urgency == "high":
        parts.append("High urgency: minimize contingencies and shorten inspection window.")
    return " ".join(parts) or "Market is balanced — offer at STRATA fair value estimate."


def _build_strategy_notes(strategy: str, urgency: str, dom: int) -> str:
    if strategy in ("BRRRR", "Fix & Flip"):
        return "Leave negotiation room for rehab costs — target list-10% or better."
    if strategy == "Short-Term Rental":
        return "STR revenue potential may support paying closer to list if occupancy projections are strong."
    return "For LTR at this market, bid near fair value mid-point and request seller concessions on closing costs."


# ── Renovation Estimate ──────────────────────────────────────────────────────

class RenovationRequest(BaseModel):
    scope: list[str]
    condition: Literal["poor", "fair", "average", "good"] = "average"
    sqft: float
    year_built: int | None = None
    property_type: str = "Single Family"
    state: str = "TX"
    baths: float | None = None
    fair_value_low: float | None = None
    fair_value_high: float | None = None


@router.post("/{property_id}/renovation-estimate")
async def renovation_estimate(
    property_id: str,
    body: RenovationRequest,
    _: User | None = _OptUser,
):
    scope = [s for s in body.scope if s in renovation_service.VALID_SCOPES]
    if not scope:
        raise HTTPException(status_code=422, detail="Select at least one valid scope item")

    # Try to resolve fair value range from the property if not provided
    fv_low = body.fair_value_low
    fv_high = body.fair_value_high
    if fv_low is None or fv_high is None:
        mock = next((p for p in property_service.MOCK_PROPERTIES if p["id"] == property_id), None)
        if mock:
            fv_low = fv_low or mock.get("fair_value_low")
            fv_high = fv_high or mock.get("fair_value_high")

    estimate = renovation_service.compute_estimate(
        scope=scope,
        condition=body.condition,
        sqft=body.sqft,
        property_type=body.property_type,
        state=body.state,
        baths=body.baths,
    )
    arv = renovation_service.compute_arv_uplift(scope, fv_low, fv_high)
    sow = await renovation_service.generate_sow(
        scope=scope, condition=body.condition, sqft=body.sqft,
        property_type=body.property_type, state=body.state,
        total_low=estimate["total_low"], total_high=estimate["total_high"],
    )

    return {
        **estimate,
        **arv,
        "scope_of_work": sow,
        "scope": scope,
        "condition": body.condition,
    }


# ── Closing Costs ─────────────────────────────────────────────────────────────

STATE_TRANSFER_TAX = {
    "TX": 0.0,
    "FL": 0.007,
    "TN": 0.0037,
    "AZ": 0.0,
    "GA": 0.001,
    "SC": 0.004,
    "NC": 0.002,
    "CO": 0.001,
    "CA": 0.0011,
    "NY": 0.004,
}

ATTORNEY_REQUIRED_STATES = {"GA", "SC", "MA", "NY", "CT", "VT", "DE", "KY"}


class ClosingCostsRequest(BaseModel):
    purchase_price: float
    loan_amount: float
    state: str = "TX"
    is_first_time_buyer: bool = False
    loan_type: str = "30yr Fixed"


@router.post("/{property_id}/closing-costs")
async def closing_costs(
    property_id: str,
    body: ClosingCostsRequest,
    _: User | None = _OptUser,
):
    state = body.state.upper()
    loan = body.loan_amount
    price = body.purchase_price
    down = price - loan

    # Get current rate estimate (simple approximation)
    rate = 0.0725
    prepaid_days = 7
    prepaid_interest = (loan * rate / 365) * prepaid_days

    items = []

    def add(name, amount, item_type, required, notes=""):
        items.append({
            "name": name,
            "amount": round(amount, 2),
            "type": item_type,
            "required": required,
            "notes": notes,
        })

    # Loan origination (0.5-1%)
    origination = loan * 0.0075
    add("Loan Origination Fee", origination, "lender", True, "Typically 0.5–1% of loan amount")

    # Appraisal
    add("Appraisal Fee", 650, "lender", True, "Lender-required independent valuation")

    # Home inspection
    add("Home Inspection", 500, "buyer", True, "Recommended — price varies by size")

    # Title insurance — lender
    lender_title = max(500, loan * 0.002)
    add("Title Insurance (Lender's Policy)", min(lender_title, 900), "lender", True, "Protects lender against title defects")

    # Title insurance — owner
    owner_title = max(800, price * 0.0025)
    add("Title Insurance (Owner's Policy)", min(owner_title, 1400), "buyer", False, "Strongly recommended — one-time fee")

    # Recording fees
    add("Recording Fees", 175, "govt", True, "County recording of deed and mortgage")

    # Transfer tax
    transfer_rate = STATE_TRANSFER_TAX.get(state, 0.001)
    if transfer_rate > 0:
        add("Transfer Tax", price * transfer_rate, "govt", True, f"{state} state transfer tax rate: {transfer_rate*100:.3f}%")

    # Prepaid interest
    add("Prepaid Interest (7 days)", round(prepaid_interest), "lender", True, "Interest from closing to first payment")

    # Property tax escrow (2 months)
    tax_monthly = (price * 0.022) / 12
    add("Property Tax Escrow (2 months)", round(tax_monthly * 2), "lender", True, "Initial escrow reserve")

    # Insurance escrow (2 months)
    add("Homeowners Insurance Escrow (2 months)", 280, "lender", True, "Based on est. $140/mo premium")

    # Attorney fee (required in some states)
    if state in ATTORNEY_REQUIRED_STATES:
        add("Attorney Fee", 850, "buyer", True, f"Required in {state}")

    # Survey
    add("Survey", 550, "buyer", False, "Recommended for properties on large lots")

    total_buyer = sum(i["amount"] for i in items if i["type"] in ("buyer", "lender", "govt"))
    total_cash_to_close = down + total_buyer
    range_low = total_buyer * 0.85
    range_high = total_buyer * 1.15

    return {
        "items": items,
        "totalBuyerCosts": round(total_buyer),
        "totalCashToClose": round(total_cash_to_close),
        "rangeLow": round(range_low),
        "rangeHigh": round(range_high),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

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
