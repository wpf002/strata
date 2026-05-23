import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_db
from ..models.client import Client
from ..models.client_activity import ClientActivity
from ..models.client_transaction import ClientTransaction
from ..models.user import User
from ..schemas.client import ClientCreate, ClientUpdate, ClientResponse
from ..schemas.client_transaction import (
    DEFAULT_MILESTONES,
    Milestone,
    MilestonePatch,
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
)
from ..services.property_service import search_properties, MOCK_PROPERTIES
from ..schemas.property import PropertyResponse

router = APIRouter(prefix="/clients")

ACTIVITY_TYPES = {"viewed", "saved", "shared", "underwritten", "copilot_asked", "reported"}

# Email allowed to receive the demo-client seed. Idempotent — only fires once
# per user when their clients table is empty, never overwrites existing data.
DEMO_USER_EMAILS = {"wfoti71992@gmail.com"}

DEMO_CLIENTS_SEED = [
    {
        "name": "Marcus Johnson",
        "email": "marcus.johnson@example.com",
        "phone": "(214) 555-0142",
        "strategy": "BRRRR",
        "min_price": 150_000,
        "max_price": 280_000,
        "target_markets": ["Dallas, TX", "Fort Worth, TX"],
        "property_types": ["Single Family"],
        "notes": "Looking for distressed SFR, prefers 3/2. Cash buyer, can close in 14 days.",
    },
    {
        "name": "Sarah Chen",
        "email": "sarah.chen@example.com",
        "phone": "(469) 555-0271",
        "strategy": "LTR",
        "min_price": 250_000,
        "max_price": 450_000,
        "target_markets": ["Dallas, TX", "Frisco, TX"],
        "property_types": ["Single Family", "Townhouse"],
        "notes": "First investment property — conservative underwriting. Prefers newer builds, low maintenance.",
    },
    {
        "name": "David Reyes",
        "email": "david.reyes@example.com",
        "phone": "(972) 555-0388",
        "strategy": "Fix & Flip",
        "min_price": 100_000,
        "max_price": 200_000,
        "target_markets": ["Dallas, TX", "Mesquite, TX"],
        "property_types": ["Single Family"],
        "notes": "Experienced flipper — 3–4 deals per year. Has a full crew and hard-money line.",
    },
    {
        "name": "Priya Patel",
        "email": "priya.patel@example.com",
        "phone": "(214) 555-0419",
        "strategy": "STR",
        "min_price": 300_000,
        "max_price": 500_000,
        "target_markets": ["Dallas, TX", "Arlington, TX"],
        "property_types": ["Single Family", "Condo"],
        "notes": "Active Airbnb host scaling to 3+ properties. Targets neighborhoods with no STR restrictions.",
    },
]


async def _maybe_seed_demo_clients(db: AsyncSession, user: User) -> None:
    """Seed demo clients exactly once for the demo user. Skips silently when the
    user is not a demo user or already has clients — never overwrites data."""
    if (user.email or "").lower() not in DEMO_USER_EMAILS:
        return
    existing = await db.execute(
        select(Client.id).where(Client.user_id == user.id).limit(1)
    )
    if existing.scalar_one_or_none() is not None:
        return
    for seed in DEMO_CLIENTS_SEED:
        db.add(Client(user_id=user.id, **seed))
    await db.flush()

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
    await _maybe_seed_demo_clients(db, current_user)
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


# ── Transactions ─────────────────────────────────────────────────────────────

TRANSACTION_STATUSES = {"searching", "offer_made", "under_contract", "closing", "closed", "cancelled"}
MILESTONE_STATUSES = {"pending", "complete", "skipped"}


def _default_milestone_set() -> list[dict]:
    return [
        {
            "id": f"m{i + 1}",
            "label": label,
            "status": "pending",
            "target_date": None,
            "completed_date": None,
            "notes": None,
        }
        for i, label in enumerate(DEFAULT_MILESTONES)
    ]


def _transaction_response(t: ClientTransaction) -> TransactionResponse:
    milestones = [Milestone(**m) for m in (t.milestones or [])]
    progress_total = sum(1 for m in milestones if m.status != "skipped")
    progress_count = sum(1 for m in milestones if m.status == "complete")
    progress_pct = int(round((progress_count / progress_total) * 100)) if progress_total else 0
    return TransactionResponse(
        id=str(t.id),
        client_id=str(t.client_id),
        property_id=t.property_id,
        property_address=t.property_address,
        status=t.status,
        milestones=milestones,
        created_at=t.created_at,
        updated_at=t.updated_at,
        progress_pct=progress_pct,
        progress_count=progress_count,
        progress_total=progress_total,
    )


async def _client_for_user(db: AsyncSession, client_id: uuid.UUID, user_id: uuid.UUID) -> Client:
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.user_id == user_id)
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


async def _transaction_for_agent(
    db: AsyncSession, client_id: uuid.UUID, txn_id: uuid.UUID, user_id: uuid.UUID,
) -> ClientTransaction:
    result = await db.execute(
        select(ClientTransaction).where(
            ClientTransaction.id == txn_id,
            ClientTransaction.client_id == client_id,
            ClientTransaction.agent_user_id == user_id,
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return t


@router.post("/{client_id}/transactions", response_model=TransactionResponse, status_code=201)
async def create_transaction(
    client_id: uuid.UUID,
    body: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _client_for_user(db, client_id, current_user.id)

    now = datetime.now(timezone.utc)
    t = ClientTransaction(
        agent_user_id=current_user.id,
        client_id=client_id,
        property_id=body.property_id,
        property_address=body.property_address,
        status="searching",
        milestones=_default_milestone_set(),
        created_at=now,
        updated_at=now,
    )
    db.add(t)
    await db.flush()
    return _transaction_response(t)


@router.get("/{client_id}/transactions", response_model=list[TransactionResponse])
async def list_transactions(
    client_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _client_for_user(db, client_id, current_user.id)

    result = await db.execute(
        select(ClientTransaction)
        .where(
            ClientTransaction.client_id == client_id,
            ClientTransaction.agent_user_id == current_user.id,
        )
        .order_by(desc(ClientTransaction.updated_at))
    )
    return [_transaction_response(t) for t in result.scalars().all()]


@router.put("/{client_id}/transactions/{txn_id}", response_model=TransactionResponse)
async def update_transaction(
    client_id: uuid.UUID,
    txn_id: uuid.UUID,
    body: TransactionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = await _transaction_for_agent(db, client_id, txn_id, current_user.id)

    if body.status is not None:
        if body.status not in TRANSACTION_STATUSES:
            raise HTTPException(status_code=422, detail=f"Invalid status. Allowed: {sorted(TRANSACTION_STATUSES)}")
        t.status = body.status
    if body.property_address is not None:
        t.property_address = body.property_address
    if body.milestones is not None:
        for m in body.milestones:
            if m.status not in MILESTONE_STATUSES:
                raise HTTPException(status_code=422, detail=f"Invalid milestone status '{m.status}'")
        t.milestones = [m.model_dump() for m in body.milestones]

    await db.flush()
    return _transaction_response(t)


@router.patch("/{client_id}/transactions/{txn_id}/milestones/{milestone_id}", response_model=TransactionResponse)
async def patch_milestone(
    client_id: uuid.UUID,
    txn_id: uuid.UUID,
    milestone_id: str,
    body: MilestonePatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = await _transaction_for_agent(db, client_id, txn_id, current_user.id)

    if body.status is not None and body.status not in MILESTONE_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid milestone status '{body.status}'")

    milestones = list(t.milestones or [])
    found = False
    now_iso = datetime.now(timezone.utc).isoformat()
    for m in milestones:
        if m.get("id") == milestone_id:
            found = True
            if body.status is not None:
                m["status"] = body.status
                # Auto-stamp completed_date when marking complete; clear on reopen.
                if body.status == "complete" and not m.get("completed_date"):
                    m["completed_date"] = now_iso
                elif body.status == "pending":
                    m["completed_date"] = None
            if body.notes is not None:
                m["notes"] = body.notes
            if body.target_date is not None:
                m["target_date"] = body.target_date
            if body.completed_date is not None:
                m["completed_date"] = body.completed_date
            break
    if not found:
        raise HTTPException(status_code=404, detail="Milestone not found")

    # Force SQLAlchemy to detect the mutation of the JSONB list.
    t.milestones = milestones

    # Auto-advance the transaction status based on milestone completion — gives
    # agents a useful default they can still override via update_transaction.
    complete_ids = {m["id"] for m in milestones if m.get("status") == "complete"}
    if "m8" in complete_ids:
        t.status = "closed"
    elif "m7" in complete_ids or "m6" in complete_ids or "m5" in complete_ids:
        t.status = "closing"
    elif "m4" in complete_ids or "m3" in complete_ids:
        t.status = "under_contract"
    elif "m2" in complete_ids:
        t.status = "offer_made"

    await db.flush()
    return _transaction_response(t)


@router.delete("/{client_id}/transactions/{txn_id}", status_code=204)
async def delete_transaction(
    client_id: uuid.UUID,
    txn_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = await _transaction_for_agent(db, client_id, txn_id, current_user.id)
    await db.delete(t)
