import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..auth import get_current_user
from ..config import get_settings
from ..database import get_db
from ..models.user import User
from ..schemas.user import UserResponse, UserUpdate, AuthVerifyRequest, AuthVerifyResponse

router = APIRouter()


@router.post("/auth/verify", response_model=AuthVerifyResponse)
async def verify_token(body: AuthVerifyRequest, db: AsyncSession = Depends(get_db)):
    settings = get_settings()

    if not settings.supabase_jwt_secret:
        raise HTTPException(status_code=503, detail="Auth not configured")

    try:
        payload = jwt.decode(
            body.token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")

    user_id = uuid.UUID(payload["sub"])
    email: str = payload.get("email", "")
    meta: dict = payload.get("user_metadata", {}) or {}

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            id=user_id,
            email=email,
            name=meta.get("full_name") or meta.get("name"),
        )
        db.add(user)
        await db.flush()

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
