"""Leads — properties the current user has engaged with.

An activity is any interaction with a property: viewing Intelligence, running
Underwrite, generating a report, etc. Each activity upserts a (user, property,
type) row with a running count. The /leads endpoint groups by property and
returns an engagement-scored list.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models.user import User
from ..models.user_property_activity import UserPropertyActivity
from ..services.property_service import MOCK_PROPERTIES, get_property_by_id

router = APIRouter()

ACTIVITY_TYPES = {"viewed", "underwritten", "reported", "saved", "copilot_asked"}

# Same weighting approach used for client activity — higher intent = higher weight.
ENGAGEMENT_WEIGHTS = {
    "viewed": 1,
    "copilot_asked": 2,
    "saved": 3,
    "reported": 4,
    "underwritten": 5,
}


class ActivityRequest(BaseModel):
    property_id: str
    activity_type: str
    metadata: dict | None = None


class ActivityDeleteRequest(BaseModel):
    property_id: str
    activity_type: str


def _property_summary_from_mock(property_id: str) -> dict | None:
    mock = next((p for p in MOCK_PROPERTIES if p["id"] == property_id), None)
    if not mock:
        return None
    return {
        "address": mock.get("address", property_id),
        "city": mock.get("city"),
        "state": mock.get("state"),
        "price": mock.get("price"),
        "image": mock.get("image"),
        "dealScore": mock.get("deal_score"),
    }


async def _property_summary(db, property_id: str) -> dict | None:
    """Hydrate a lead's property metadata. Tries DB (real listings cached from
    RapidAPI) first, then mocks. Returns None when neither resolves so the
    caller can drop ghost leads (listings that have since vanished or were
    never persisted) from the response entirely."""
    try:
        prop = await get_property_by_id(db, property_id)
        if prop is not None:
            return {
                "address": prop.address or property_id,
                "city": prop.city,
                "state": prop.state,
                "price": prop.price,
                "image": prop.image,
                "dealScore": prop.deal_score,
            }
    except Exception:
        pass
    return _property_summary_from_mock(property_id)


@router.post("/activity", status_code=201)
async def record_activity(
    body: ActivityRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.activity_type not in ACTIVITY_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid activity_type '{body.activity_type}'. Allowed: {sorted(ACTIVITY_TYPES)}",
        )

    existing = await db.execute(
        select(UserPropertyActivity).where(
            and_(
                UserPropertyActivity.user_id == current_user.id,
                UserPropertyActivity.property_id == body.property_id,
                UserPropertyActivity.activity_type == body.activity_type,
            )
        )
    )
    row = existing.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if row:
        row.count += 1
        row.last_occurred_at = now
        if body.metadata:
            row.activity_metadata = body.metadata
    else:
        row = UserPropertyActivity(
            user_id=current_user.id,
            property_id=body.property_id,
            activity_type=body.activity_type,
            count=1,
            last_occurred_at=now,
            activity_metadata=body.metadata,
        )
        db.add(row)

    await db.flush()
    return {"ok": True, "count": row.count}


@router.post("/activity/remove", status_code=204)
async def remove_activity(
    body: ActivityDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a (user, property, type) engagement row — used when a user
    unfavorites a property so the Leads list reflects real current intent."""
    if body.activity_type not in ACTIVITY_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid activity_type '{body.activity_type}'")

    result = await db.execute(
        select(UserPropertyActivity).where(
            and_(
                UserPropertyActivity.user_id == current_user.id,
                UserPropertyActivity.property_id == body.property_id,
                UserPropertyActivity.activity_type == body.activity_type,
            )
        )
    )
    row = result.scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.flush()


@router.get("/leads")
async def list_leads(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows_result = await db.execute(
        select(UserPropertyActivity).where(UserPropertyActivity.user_id == current_user.id)
    )
    rows = rows_result.scalars().all()

    grouped: dict[str, dict] = {}
    # Hydrate properties up-front so we issue at most one lookup per unique id.
    # Drop any id that doesn't resolve — those are ghost leads (e.g. RapidAPI
    # listings that expired) and showing them as "Unavailable" is worse UX than
    # hiding them.
    unique_ids = {row.property_id for row in rows}
    summaries: dict[str, dict] = {}
    for pid in unique_ids:
        summary = await _property_summary(db, pid)
        if summary is not None:
            summaries[pid] = summary

    for row in rows:
        pid = row.property_id
        if pid not in summaries:
            continue  # ghost lead — skip
        if pid not in grouped:
            grouped[pid] = {
                "propertyId": pid,
                **summaries[pid],
                "activities": {},
                "lastActive": None,
                "engagementScore": 0,
            }

        last_at = row.last_occurred_at
        if last_at and last_at.tzinfo is None:
            last_at = last_at.replace(tzinfo=timezone.utc)

        grouped[pid]["activities"][row.activity_type] = {
            "count": row.count,
            "lastAt": last_at.isoformat() if last_at else None,
        }

        current_last = grouped[pid]["lastActive"]
        if last_at and (current_last is None or last_at.isoformat() > current_last):
            grouped[pid]["lastActive"] = last_at.isoformat()

    for data in grouped.values():
        data["engagementScore"] = sum(
            ENGAGEMENT_WEIGHTS.get(act, 1) * info["count"]
            for act, info in data["activities"].items()
        )

    return sorted(grouped.values(), key=lambda x: x["engagementScore"], reverse=True)
