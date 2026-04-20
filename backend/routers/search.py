import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..auth import get_current_user
from ..database import get_db
from ..models.search import SavedSearch, Watchlist
from ..models.user import User
from ..schemas.search import (
    SavedSearchCreate,
    SavedSearchResponse,
    WatchlistCreate,
    WatchlistResponse,
)

router = APIRouter()


# ── Saved Searches ────────────────────────────────────────────────────────────

@router.get("/saved-searches", response_model=list[SavedSearchResponse])
async def list_saved_searches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedSearch)
        .where(SavedSearch.user_id == current_user.id)
        .order_by(SavedSearch.created_at.desc())
    )
    return result.scalars().all()


@router.post("/saved-searches", response_model=SavedSearchResponse, status_code=201)
async def create_saved_search(
    body: SavedSearchCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    search = SavedSearch(
        user_id=current_user.id,
        criteria=body.criteria,
        alert_enabled=body.alert_enabled,
    )
    db.add(search)
    await db.flush()
    return search


@router.delete("/saved-searches/{search_id}", status_code=204)
async def delete_saved_search(
    search_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedSearch).where(
            SavedSearch.id == search_id,
            SavedSearch.user_id == current_user.id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Saved search not found")
    await db.delete(row)


# ── Watchlists ────────────────────────────────────────────────────────────────

@router.get("/watchlists", response_model=list[WatchlistResponse])
async def list_watchlists(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Watchlist)
        .where(Watchlist.user_id == current_user.id)
        .order_by(Watchlist.created_at.desc())
    )
    rows = result.scalars().all()
    return [_watchlist_schema(w) for w in rows]


@router.post("/watchlists", response_model=WatchlistResponse, status_code=201)
async def create_watchlist(
    body: WatchlistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wl = Watchlist(user_id=current_user.id, name=body.name, property_ids=[])
    db.add(wl)
    await db.flush()
    return _watchlist_schema(wl)


@router.post("/watchlists/{watchlist_id}/properties/{property_id}", response_model=WatchlistResponse)
async def add_to_watchlist(
    watchlist_id: uuid.UUID,
    property_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wl = await _get_watchlist(db, watchlist_id, current_user.id)
    ids: list = list(wl.property_ids or [])
    if property_id not in ids:
        ids.append(property_id)
        wl.property_ids = ids
    await db.flush()
    return _watchlist_schema(wl)


@router.delete("/watchlists/{watchlist_id}/properties/{property_id}", response_model=WatchlistResponse)
async def remove_from_watchlist(
    watchlist_id: uuid.UUID,
    property_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wl = await _get_watchlist(db, watchlist_id, current_user.id)
    wl.property_ids = [p for p in (wl.property_ids or []) if p != property_id]
    await db.flush()
    return _watchlist_schema(wl)


async def _get_watchlist(
    db: AsyncSession, watchlist_id: uuid.UUID, user_id: uuid.UUID
) -> Watchlist:
    result = await db.execute(
        select(Watchlist).where(
            Watchlist.id == watchlist_id,
            Watchlist.user_id == user_id,
        )
    )
    wl = result.scalar_one_or_none()
    if not wl:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return wl


def _watchlist_schema(w: Watchlist) -> WatchlistResponse:
    return WatchlistResponse(
        id=str(w.id),
        name=w.name,
        property_ids=[str(p) for p in (w.property_ids or [])],
        created_at=w.created_at,
    )
