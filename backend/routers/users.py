import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user, _decode_token
from ..database import get_db
from ..models.user import User
from ..schemas.user import UserResponse, UserUpdate, AuthVerifyRequest, AuthVerifyResponse

router = APIRouter()


@router.post("/auth/verify", response_model=AuthVerifyResponse)
async def verify_token(body: AuthVerifyRequest, db: AsyncSession = Depends(get_db)):
    payload = await _decode_token(body.token)
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token subject")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return AuthVerifyResponse(user=UserResponse.model_validate(user), token_valid=True)


@router.get("/users/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.put("/users/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.name is not None:
        current_user.name = body.name
    if body.strategy_settings is not None:
        current_user.strategy_settings = body.strategy_settings
    await db.flush()
    return UserResponse.model_validate(current_user)


# ── Push Token ────────────────────────────────────────────────────────────────

class PushTokenRequest(BaseModel):
    token: str
    platform: Literal["ios", "android"]


@router.put("/users/me/push-token")
async def update_push_token(
    body: PushTokenRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.push_token = body.token
    current_user.push_platform = body.platform
    await db.flush()
    return {"ok": True}
