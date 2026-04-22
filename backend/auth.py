"""
Supabase JWT validation + user-from-token dependency.

Supports both ES256 (new Supabase projects with EC keys) and HS256 (legacy).
EC public key is fetched once from the Supabase JWKS endpoint and cached in memory.
"""
import json
import logging
import uuid

import httpx
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .config import get_settings
from .database import get_db
from .models.user import User

log = logging.getLogger(__name__)

_security = HTTPBearer(auto_error=False)
_security_optional = HTTPBearer(auto_error=False)

_401 = HTTPException(
    status_code=401,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)

# Cached as (key_object, algorithms_list) after first successful load
_key_cache: tuple | None = None


async def _load_key() -> tuple:
    """Fetch the Supabase JWKS endpoint and return (key, algorithms).
    Prefers ES256 EC keys; falls back to configured HS256 secret."""
    global _key_cache
    if _key_cache is not None:
        return _key_cache

    settings = get_settings()

    if settings.supabase_url:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
                )
                resp.raise_for_status()
                jwks = resp.json()

            for key_data in jwks.get("keys", []):
                kty = key_data.get("kty")
                if kty == "EC":
                    from jwt.algorithms import ECAlgorithm
                    pub = ECAlgorithm.from_jwk(json.dumps(key_data))
                    _key_cache = (pub, ["ES256"])
                    log.info("Loaded Supabase EC public key (ES256)")
                    return _key_cache
                if kty == "RSA":
                    from jwt.algorithms import RSAAlgorithm
                    pub = RSAAlgorithm.from_jwk(json.dumps(key_data))
                    _key_cache = (pub, ["RS256"])
                    log.info("Loaded Supabase RSA public key (RS256)")
                    return _key_cache
        except Exception as exc:
            log.warning("JWKS fetch failed, falling back to HS256: %s", exc)

    # Legacy HS256 fallback
    if settings.supabase_jwt_secret:
        _key_cache = (settings.supabase_jwt_secret, ["HS256"])
        log.info("Using HS256 JWT secret")
        return _key_cache

    raise HTTPException(status_code=503, detail="Auth not configured — set SUPABASE_URL or SUPABASE_JWT_SECRET")


def _invalidate_key_cache():
    """Call this if you suspect key rotation (e.g. after a 401 on a fresh token)."""
    global _key_cache
    _key_cache = None


async def _decode_token(token: str) -> dict:
    key, algorithms = await _load_key()
    try:
        return jwt.decode(token, key, algorithms=algorithms, audience="authenticated")
    except jwt.ExpiredSignatureError:
        log.warning("JWT validation failed: token expired")
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        log.warning("JWT validation failed: %s", exc)
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise _401

    payload = await _decode_token(credentials.credentials)

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token subject")

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

    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security_optional),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    try:
        payload = await _decode_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()
    except Exception:
        return None
