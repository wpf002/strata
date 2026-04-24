from datetime import datetime

from . import CamelModel


class ClientPortalCreate(CamelModel):
    client_id: str
    name: str | None = None
    property_ids: list[str] = []


class ClientPortalSummary(CamelModel):
    id: str
    client_id: str
    client_name: str | None
    name: str
    magic_link_token: str
    share_url: str
    property_count: int
    status: str
    created_at: datetime
    updated_at: datetime
    last_client_activity_at: datetime | None = None


class PortalProperty(CamelModel):
    id: str
    address: str
    city: str | None
    state: str | None
    price: float | None
    beds: int | None
    baths: float | None
    sqft: int | None
    image: str | None
    deal_score: int | None
    cap_rate: float | None
    cash_flow: float | None
    rent_estimate: float | None
    neighborhood_score: int | None
    days_on_market: int | None


class PortalActivityEntry(CamelModel):
    id: str
    property_id: str | None
    action_type: str
    client_name: str | None
    client_email: str | None
    occurred_at: datetime


class ClientPortalDetail(CamelModel):
    id: str
    client_id: str
    client_name: str | None
    name: str
    magic_link_token: str
    share_url: str
    status: str
    created_at: datetime
    updated_at: datetime
    properties: list[PortalProperty]
    activity: list[PortalActivityEntry]


class PortalPublicView(CamelModel):
    portal_name: str
    agent: dict
    properties: list[PortalProperty]


class PortalActivityRequest(CamelModel):
    property_id: str | None = None
    action_type: str
    client_name: str | None = None
    client_email: str | None = None


class AddPropertyRequest(CamelModel):
    property_id: str
