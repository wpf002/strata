from datetime import datetime
from . import CamelModel


class UserResponse(CamelModel):
    id: str
    email: str
    name: str | None
    subscription_tier: str
    strategy_settings: dict
    created_at: datetime


class UserUpdate(CamelModel):
    name: str | None = None
    strategy_settings: dict | None = None


class AuthVerifyRequest(CamelModel):
    token: str


class AuthVerifyResponse(CamelModel):
    user: UserResponse
    token_valid: bool
