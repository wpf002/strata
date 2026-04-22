import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..auth import get_current_user
from ..database import get_db
from ..models.client import Client
from ..models.user import User
from ..schemas.client import ClientCreate, ClientUpdate, ClientResponse
from ..services.property_service import search_properties
from ..schemas.property import PropertyResponse

router = APIRouter(prefix="/clients")


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

    # Build search query from client criteria
    query = None
    if client.target_markets:
        query = client.target_markets[0]

    properties = await search_properties(
        db=db,
        query=query,
        max_price=float(client.max_price) if client.max_price else None,
        property_types=client.property_types if client.property_types else None,
        sort_by="Deal Score",
    )

    # Filter by min price if set
    if client.min_price:
        properties = [p for p in properties if p.price >= client.min_price]

    return properties[:5]
