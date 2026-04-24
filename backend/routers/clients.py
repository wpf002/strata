import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_db
from ..models.client import Client
from ..models.client_activity import ClientActivity
from ..models.user import User
from ..schemas.client import ClientCreate, ClientUpdate, ClientResponse
from ..services.property_service import search_properties, MOCK_PROPERTIES
from ..schemas.property import PropertyResponse

router = APIRouter(prefix="/clients")

ACTIVITY_TYPES = {"viewed", "saved", "shared", "underwritten", "copilot_asked", "reported"}

# ── helpers ───────────────────────────────────────────────────────────────────

def _to_schema(c: Client) -> ClientResponse:
    return ClientResponse(
        id=str(c.id),
        name=c.name,
        email=c.email,
        phone=c.phone,
        strategy=c.strategy,
        min_price=c.min_price,
        max_price=c.max_price,
        target_markets=c.target_markets or [],
        property_types=c.property_types or [],
        notes=c.notes,
        created_at=c.created_at,
    )


def _days_ago(dt: datetime | None) -> int | None:
    if not dt:
        return None
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return max(0, (now - dt).days)


def _address_for_property_id(property_id: str) -> tuple[str, float | None]:
    mock = next((p for p in MOCK_PROPERTIES if p["id"] == property_id), None)
    if mock:
        return mock["address"], mock.get("price")
    return property_id, None


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ClientResponse])
async def list_clients(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Client)
        .where(Client.user_id == current_user.id)
        .order_by(Client.created_at.desc())
    )
    return [_to_schema(c) for c in result.scalars().all()]


@router.post("", response_model=ClientResponse, status_code=201)
async def create_client(
    body: ClientCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    client = Client(
        user_id=current_user.id,
        name=body.name,
        email=body.email,
        phone=body.phone,
        strategy=body.strategy,
        min_price=body.min_price,
        max_price=body.max_price,
        target_markets=body.target_markets,
        property_types=body.property_types,
        notes=body.notes,
    )
    db.add(client)
    await db.flush()
    return _to_schema(client)


@router.put("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: uuid.UUID,
    body: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.user_id == current_user.id)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(client, field, value)
    await db.flush()
    return _to_schema(client)


@router.delete("/{client_id}", status_code=204)
async def delete_client(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.user_id == current_user.id)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await db.delete(client)


@router.get("/{client_id}/matches", response_model=list[PropertyResponse])
async def get_client_matches(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.user_id == current_user.id)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    query = client.target_markets[0] if client.target_markets else None

    properties = await search_properties(
        db=db,
        query=query,
        max_price=float(client.max_price) if client.max_price else None,
        property_types=client.property_types if client.property_types else None,
        sort_by="Deal Score",
    )

    if client.min_price:
        properties = [p for p in properties if p.price >= client.min_price]

    return properties[:5]


# ── Activity ──────────────────────────────────────────────────────────────────

class ActivityRequest(BaseModel):
    property_id: str
    activity_type: str
    metadata: dict | None = None


@router.post("/{client_id}/activity", status_code=201)
async def record_activity(
    client_id: uuid.UUID,
    body: ActivityRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.activity_type not in ACTIVITY_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid activity_type: {body.activity_type}")

    # Verify client belongs to this user
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    # Upsert: increment count if row exists
    existing = await db.execute(
        select(ClientActivity).where(
            and_(
                ClientActivity.client_id == client_id,
                ClientActivity.property_id == body.property_id,
                ClientActivity.activity_type == body.activity_type,
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
        row = ClientActivity(
            user_id=current_user.id,
            client_id=client_id,
            property_id=body.property_id,
            activity_type=body.activity_type,
            count=1,
            last_occurred_at=now,
            activity_metadata=body.metadata,
        )
        db.add(row)

    await db.flush()
    return {"ok": True, "count": row.count}


@router.get("/{client_id}/activity")
async def get_client_activity(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify client belongs to this user
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Client not found")

    rows_result = await db.execute(
        select(ClientActivity).where(
            and_(
                ClientActivity.client_id == client_id,
                ClientActivity.user_id == current_user.id,
            )
        )
    )
    rows = rows_result.scalars().all()

    # Group by property_id
    grouped: dict[str, dict] = {}
    for row in rows:
        pid = row.property_id
        if pid not in grouped:
            address, price = _address_for_property_id(pid)
            grouped[pid] = {
                "propertyId": pid,
                "address": address,
                "price": price,
                "image": None,
                "activities": {},
                "lastActive": None,
            }

        last_at = row.last_occurred_at
        if last_at and last_at.tzinfo is None:
            last_at = last_at.replace(tzinfo=timezone.utc)

        grouped[pid]["activities"][row.activity_type] = {
            "count": row.count,
            "lastAt": last_at.isoformat() if last_at else None,
        }

        # Track most recent activity across all types
        current_last = grouped[pid]["lastActive"]
        if last_at and (current_last is None or last_at.isoformat() > current_last):
            grouped[pid]["lastActive"] = last_at.isoformat()

    # Add mock data (image) and compute engagement score
    weights = {"viewed": 1, "saved": 3, "shared": 4, "underwritten": 5, "copilot_asked": 2, "reported": 4}
    output = []
    for pid, data in grouped.items():
        mock = next((p for p in MOCK_PROPERTIES if p["id"] == pid), None)
        if mock:
            data["image"] = mock.get("image")

        score = sum(
            weights.get(act, 1) * info["count"]
            for act, info in data["activities"].items()
        )
        data["engagementScore"] = score
        output.append(data)

    output.sort(key=lambda x: x["engagementScore"], reverse=True)
    return output
