from datetime import datetime

from . import CamelModel


# Default milestone set every new transaction starts with. Agents can later
# mark each complete (or skip it) to track the deal's progress.
DEFAULT_MILESTONES: list[str] = [
    "Property identified",
    "Offer submitted",
    "Offer accepted",
    "Inspection complete",
    "Appraisal complete",
    "Loan approved",
    "Final walkthrough",
    "Closed",
]


class Milestone(CamelModel):
    id: str
    label: str
    status: str  # "pending" | "complete" | "skipped"
    target_date: str | None = None
    completed_date: str | None = None
    notes: str | None = None


class TransactionCreate(CamelModel):
    property_id: str | None = None
    property_address: str


class TransactionUpdate(CamelModel):
    status: str | None = None
    property_address: str | None = None
    milestones: list[Milestone] | None = None


class MilestonePatch(CamelModel):
    status: str | None = None
    notes: str | None = None
    target_date: str | None = None
    completed_date: str | None = None


class TransactionResponse(CamelModel):
    id: str
    client_id: str
    property_id: str | None
    property_address: str
    status: str
    milestones: list[Milestone]
    created_at: datetime
    updated_at: datetime
    progress_pct: int
    progress_count: int
    progress_total: int
