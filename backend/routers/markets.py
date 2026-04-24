"""
Supported-markets catalog for the national expansion.

GET /markets/supported — list of all cities we can search.
"""
from fastapi import APIRouter

from ..services.markets_service import list_markets

router = APIRouter(prefix="/markets", tags=["markets"])


@router.get("/supported")
async def get_supported_markets():
    return {"markets": list_markets()}
