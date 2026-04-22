import uuid
from datetime import datetime
from . import CamelModel


class SavedSearchCreate(CamelModel):
    name: str
    criteria: dict
    alert_enabled: bool = False


class SavedSearchResponse(CamelModel):
    id: uuid.UUID
    name: str | None = None
    criteria: dict
    alert_enabled: bool
    last_run_at: datetime | None
    created_at: datetime


class WatchlistCreate(CamelModel):
    name: str


class WatchlistResponse(CamelModel):
    id: str
    name: str
    property_ids: list[str]
    created_at: datetime
