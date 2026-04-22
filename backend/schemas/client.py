from datetime import datetime
from typing import Literal
from . import CamelModel


class ClientCreate(CamelModel):
    name: str
    email: str | None = None
    phone: str | None = None
    strategy: Literal["LTR", "STR", "BRRRR", "Flip", "House Hack"] | None = None
    min_price: int | None = None
    max_price: int | None = None
    target_markets: list[str] = []
    property_types: list[str] = []
    notes: str | None = None


class ClientUpdate(CamelModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    strategy: Literal["LTR", "STR", "BRRRR", "Flip", "House Hack"] | None = None
    min_price: int | None = None
    max_price: int | None = None
    target_markets: list[str] | None = None
    property_types: list[str] | None = None
    notes: str | None = None


class ClientResponse(CamelModel):
    id: str
    name: str
    email: str | None
    phone: str | None
    strategy: str | None
    min_price: int | None
    max_price: int | None
    target_markets: list[str]
    property_types: list[str]
    notes: str | None
    created_at: datetime
