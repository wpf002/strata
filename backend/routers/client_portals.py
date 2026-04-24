"""Client Portals.

A portal is an agent-curated, shareable collection of properties for a specific
client. The client opens the portal via a magic-link URL (no auth required) and
can view, favorite, or comment — all attributed back to the portal so the agent
sees live engagement. Portal activity is also dual-written into client_activity
so existing Clients-page views stay coherent.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models.client import Client
from ..models.client_activity import ClientActivity
from ..models.client_portal import ClientPortal, ClientPortalActivity
from ..models.user import User
from ..schemas.client_portal import (
    AddPropertyRequest,
    ClientPortalCreate,
    ClientPortalDetail,
    ClientPortalSummary,
    PortalActivityEntry,
    PortalActivityRequest,
    PortalProperty,
    PortalPublicView,
)
from ..services.property_service import MOCK_PROPERTIES, get_property_by_id

router = APIRouter(prefix="/client-portals")

# Map portal action_type → client_activity.activity_type so the Clients page
# sees portal interactions in its existing feed. Unknown actions are skipped.
_CLIENT_ACTIVITY_MAP = {
    "viewed": "viewed",
    "favorited": "saved",
    "unfavorited": None,  # unfavorite shouldn't increment "saved"
    "shared": "shared",
    "commented": None,
}

_VALID_ACTIONS = {"viewed", "favorited", "unfavorited", "shared", "commented"}


def _hydrate_property(pid: str) -> PortalProperty:
    """Return mock data for a property id. Real DB lookup happens in detail
    endpoint; this is the fast path used when hydrating lists."""
    p = next((x for x in MOCK_PROPERTIES if x["id"] == pid), None)
    if not p:
        return PortalProperty(
            id=pid, address=pid, city=None, state=None,
            price=None, beds=None, baths=None, sqft=None,
            image=None, deal_score=None, cap_rate=None,
            cash_flow=None, rent_estimate=None,
            neighborhood_score=None, days_on_market=None,
        )
    return PortalProperty(
        id=p["id"],
        address=p["address"],
        city=p.get("city"),
        state=p.get("state"),
        price=p.get("price"),
        beds=p.get("beds"),
        baths=p.get("baths"),
        sqft=p.get("sqft"),
        image=p.get("image"),
        deal_score=p.get("deal_score"),
        cap_rate=p.get("cap_rate"),
        cash_flow=p.get("cash_flow"),
        rent_estimate=p.get("rent_est_mid"),
        neighborhood_score=p.get("neighborhood_score"),
        days_on_market=p.get("days_on_market"),
    )


def _portal_summary(p: ClientPortal, client_name: str | None, last_activity_at: datetime | None) -> ClientPortalSummary:
    token = str(p.magic_link_token)
    return ClientPortalSummary(
        id=str(p.id),
        client_id=str(p.client_id),
        client_name=client_name,
        name=p.name,
        magic_link_token=token,
        share_url=f"/portal/{token}",
        property_count=len(p.property_ids or []),
        status=p.status,
        created_at=p.created_at,
        updated_at=p.updated_at,
        last_client_activity_at=last_activity_at,
    )


async def _client_for_user(db: AsyncSession, client_id: uuid.UUID, user_id: uuid.UUID) -> Client:
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.user_id == user_id)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


async def _portal_for_agent(db: AsyncSession, portal_id: uuid.UUID, user_id: uuid.UUID) -> ClientPortal:
    result = await db.execute(
        select(ClientPortal).where(
            ClientPortal.id == portal_id,
            ClientPortal.agent_user_id == user_id,
        )
    )
    portal = result.scalar_one_or_none()
    if not portal:
        raise HTTPException(status_code=404, detail="Portal not found")
    return portal


# ── Agent CRUD ────────────────────────────────────────────────────────────────

@router.post("", response_model=ClientPortalSummary, status_code=201)
async def create_portal(
    body: ClientPortalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        client_uuid = uuid.UUID(body.client_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid client_id")

    client = await _client_for_user(db, client_uuid, current_user.id)

    now = datetime.now(timezone.utc)
    portal = ClientPortal(
        agent_user_id=current_user.id,
        client_id=client.id,
        name=body.name or f"{client.name}'s Properties",
        magic_link_token=uuid.uuid4(),
        property_ids=list(body.property_ids or []),
        status="active",
        created_at=now,
        updated_at=now,
    )
    db.add(portal)
    await db.flush()
    return _portal_summary(portal, client.name, None)


@router.get("", response_model=list[ClientPortalSummary])
async def list_portals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ClientPortal)
        .where(
            ClientPortal.agent_user_id == current_user.id,
            ClientPortal.status == "active",
        )
        .order_by(ClientPortal.updated_at.desc())
    )
    portals = result.scalars().all()
    if not portals:
        return []

    # Resolve client names in one query
    client_ids = list({p.client_id for p in portals})
    clients_result = await db.execute(select(Client).where(Client.id.in_(client_ids)))
    client_by_id = {c.id: c.name for c in clients_result.scalars().all()}

    # Last-activity lookup per portal
    activity_result = await db.execute(
        select(ClientPortalActivity.portal_id, ClientPortalActivity.occurred_at)
        .where(ClientPortalActivity.portal_id.in_([p.id for p in portals]))
        .order_by(desc(ClientPortalActivity.occurred_at))
    )
    latest_by_portal: dict[uuid.UUID, datetime] = {}
    for portal_id, occurred_at in activity_result.all():
        if portal_id not in latest_by_portal:
            latest_by_portal[portal_id] = occurred_at

    return [
        _portal_summary(p, client_by_id.get(p.client_id), latest_by_portal.get(p.id))
        for p in portals
    ]


@router.get("/{portal_id}", response_model=ClientPortalDetail)
async def get_portal(
    portal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portal = await _portal_for_agent(db, portal_id, current_user.id)

    client_result = await db.execute(select(Client).where(Client.id == portal.client_id))
    client = client_result.scalar_one_or_none()

    properties = [_hydrate_property(pid) for pid in (portal.property_ids or [])]

    activity_result = await db.execute(
        select(ClientPortalActivity)
        .where(ClientPortalActivity.portal_id == portal.id)
        .order_by(desc(ClientPortalActivity.occurred_at))
        .limit(100)
    )
    activity = [
        PortalActivityEntry(
            id=str(a.id),
            property_id=a.property_id,
            action_type=a.action_type,
            client_name=a.client_name,
            client_email=a.client_email,
            occurred_at=a.occurred_at,
        )
        for a in activity_result.scalars().all()
    ]

    token = str(portal.magic_link_token)
    return ClientPortalDetail(
        id=str(portal.id),
        client_id=str(portal.client_id),
        client_name=client.name if client else None,
        name=portal.name,
        magic_link_token=token,
        share_url=f"/portal/{token}",
        status=portal.status,
        created_at=portal.created_at,
        updated_at=portal.updated_at,
        properties=properties,
        activity=activity,
    )


@router.delete("/{portal_id}", status_code=204)
async def archive_portal(
    portal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portal = await _portal_for_agent(db, portal_id, current_user.id)
    portal.status = "archived"
    await db.flush()


@router.post("/{portal_id}/properties", response_model=ClientPortalDetail)
async def add_property_to_portal(
    portal_id: uuid.UUID,
    body: AddPropertyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portal = await _portal_for_agent(db, portal_id, current_user.id)
    ids = list(portal.property_ids or [])
    if body.property_id not in ids:
        ids.append(body.property_id)
        portal.property_ids = ids
        await db.flush()
    return await get_portal(portal_id, db, current_user)


@router.delete("/{portal_id}/properties/{property_id}", response_model=ClientPortalDetail)
async def remove_property_from_portal(
    portal_id: uuid.UUID,
    property_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portal = await _portal_for_agent(db, portal_id, current_user.id)
    ids = [p for p in (portal.property_ids or []) if p != property_id]
    portal.property_ids = ids
    await db.flush()
    return await get_portal(portal_id, db, current_user)


# ── Public (no auth) ──────────────────────────────────────────────────────────

async def _portal_by_token(db: AsyncSession, token: uuid.UUID) -> ClientPortal:
    result = await db.execute(
        select(ClientPortal).where(
            ClientPortal.magic_link_token == token,
            ClientPortal.status == "active",
        )
    )
    portal = result.scalar_one_or_none()
    if not portal:
        raise HTTPException(status_code=404, detail="Portal not found or archived")
    return portal


@router.get("/view/{token}", response_model=PortalPublicView)
async def view_portal(
    token: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    portal = await _portal_by_token(db, token)

    agent_result = await db.execute(select(User).where(User.id == portal.agent_user_id))
    agent = agent_result.scalar_one_or_none()
    agent_profile: dict = {"name": None, "email": None, "phone": None, "brokerage": None, "photo": None}
    if agent:
        s = agent.strategy_settings or {}
        agent_profile = {
            "name": s.get("agentName") or agent.email,
            "email": agent.email,
            "phone": s.get("agentPhone"),
            "brokerage": s.get("brokerageName"),
            "photo": s.get("agentPhotoUrl"),
        }

    properties = []
    for pid in (portal.property_ids or []):
        try:
            # Prefer live DB property; falls back to mock cleanly.
            resp = await get_property_by_id(db, pid)
            if resp is not None:
                properties.append(PortalProperty(
                    id=resp.id,
                    address=resp.address,
                    city=resp.city,
                    state=resp.state,
                    price=resp.price,
                    beds=resp.beds,
                    baths=resp.baths,
                    sqft=resp.sqft,
                    image=resp.image,
                    deal_score=resp.deal_score,
                    cap_rate=resp.cap_rate,
                    cash_flow=resp.cash_flow,
                    rent_estimate=resp.rent_est_mid,
                    neighborhood_score=resp.neighborhood_score,
                    days_on_market=resp.days_on_market,
                ))
                continue
        except Exception:
            pass
        properties.append(_hydrate_property(pid))

    return PortalPublicView(
        portal_name=portal.name,
        agent=agent_profile,
        properties=properties,
    )


@router.post("/view/{token}/activity", status_code=201)
async def record_portal_activity(
    token: uuid.UUID,
    body: PortalActivityRequest,
    db: AsyncSession = Depends(get_db),
):
    if body.action_type not in _VALID_ACTIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid action_type. Allowed: {sorted(_VALID_ACTIONS)}",
        )

    portal = await _portal_by_token(db, token)

    entry = ClientPortalActivity(
        portal_id=portal.id,
        property_id=body.property_id,
        action_type=body.action_type,
        client_name=body.client_name,
        client_email=body.client_email,
    )
    db.add(entry)

    # Mirror into client_activity so the Clients-page feed picks it up.
    mapped = _CLIENT_ACTIVITY_MAP.get(body.action_type)
    if mapped and body.property_id:
        now = datetime.now(timezone.utc)
        existing = await db.execute(
            select(ClientActivity).where(
                ClientActivity.client_id == portal.client_id,
                ClientActivity.property_id == body.property_id,
                ClientActivity.activity_type == mapped,
            )
        )
        row = existing.scalar_one_or_none()
        if row:
            row.count += 1
            row.last_occurred_at = now
        else:
            db.add(ClientActivity(
                user_id=portal.agent_user_id,
                client_id=portal.client_id,
                property_id=body.property_id,
                activity_type=mapped,
                count=1,
                last_occurred_at=now,
            ))

    await db.flush()
    return {"ok": True}
