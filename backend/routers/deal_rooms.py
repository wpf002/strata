"""
Deal Rooms router — shared workspace for buyer, agent, and lender.
"""
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from ..schemas import CamelModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models.deal_room import DealRoom, DealRoomTask, DealRoomMessage
from ..models.user import User

router = APIRouter(prefix="/deal-rooms")

_DEFAULT_TASKS = [
    "Home inspection scheduled",
    "Appraisal ordered",
    "Loan application submitted",
    "Title search initiated",
    "Insurance quote obtained",
    "Final walkthrough scheduled",
    "Closing disclosure reviewed",
]


# ── Schemas ────────────────────────────────────────────────────────────────────

class Participant(CamelModel):
    user_id: str | None = None
    role: Literal["Buyer", "Agent", "Lender", "Attorney"]
    email: str
    name: str


class CreateRoomRequest(CamelModel):
    property_address: str
    property_id: str | None = None
    participants: list[Participant] = []


class UpdateRoomRequest(CamelModel):
    status: Literal["active", "closed", "cancelled"] | None = None
    participants: list[Participant] | None = None


class CreateTaskRequest(CamelModel):
    title: str
    assigned_to_email: str | None = None
    due_date: str | None = None


class UpdateTaskRequest(CamelModel):
    status: Literal["pending", "complete"] | None = None
    title: str | None = None
    assigned_to_email: str | None = None
    due_date: str | None = None


class SendMessageRequest(BaseModel):
    content: str


# ── Serialisers ────────────────────────────────────────────────────────────────

def _room_out(room: DealRoom, tasks: list[DealRoomTask]) -> dict:
    total = len(tasks)
    complete = sum(1 for t in tasks if t.status == "complete")
    now = datetime.now(timezone.utc)
    created = room.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    days_active = max(0, (now - created).days)
    return {
        "id": str(room.id),
        "propertyAddress": room.property_address,
        "propertyId": room.property_id,
        "status": room.status,
        "participants": room.participants or [],
        "taskTotal": total,
        "taskComplete": complete,
        "daysActive": days_active,
        "createdAt": room.created_at.isoformat(),
        "updatedAt": room.updated_at.isoformat(),
    }


def _task_out(t: DealRoomTask) -> dict:
    return {
        "id": str(t.id),
        "dealRoomId": str(t.deal_room_id),
        "title": t.title,
        "assignedToEmail": t.assigned_to_email,
        "dueDate": t.due_date,
        "status": t.status,
        "createdAt": t.created_at.isoformat(),
        "completedAt": t.completed_at.isoformat() if t.completed_at else None,
    }


def _msg_out(m: DealRoomMessage) -> dict:
    return {
        "id": str(m.id),
        "dealRoomId": str(m.deal_room_id),
        "senderUserId": str(m.sender_user_id) if m.sender_user_id else None,
        "senderName": m.sender_name,
        "content": m.content,
        "createdAt": m.created_at.isoformat(),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_rooms(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DealRoom)
        .where(DealRoom.created_by_user_id == current_user.id)
        .order_by(DealRoom.updated_at.desc())
    )
    rooms = result.scalars().all()
    out = []
    for room in rooms:
        tasks_result = await db.execute(
            select(DealRoomTask).where(DealRoomTask.deal_room_id == room.id)
        )
        tasks = tasks_result.scalars().all()
        out.append(_room_out(room, tasks))
    return out


@router.post("", status_code=201)
async def create_room(
    body: CreateRoomRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = DealRoom(
        created_by_user_id=current_user.id,
        property_id=body.property_id,
        property_address=body.property_address,
        status="active",
        participants=[p.model_dump() for p in body.participants],
    )
    db.add(room)
    await db.flush()

    tasks = [
        DealRoomTask(deal_room_id=room.id, title=title)
        for title in _DEFAULT_TASKS
    ]
    for t in tasks:
        db.add(t)
    await db.flush()

    return _room_out(room, tasks)


@router.get("/{room_id}")
async def get_room(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = await _get_room_or_404(db, room_id, current_user.id)
    tasks_result = await db.execute(
        select(DealRoomTask).where(DealRoomTask.deal_room_id == room_id).order_by(DealRoomTask.created_at)
    )
    tasks = tasks_result.scalars().all()
    out = _room_out(room, tasks)
    out["tasks"] = [_task_out(t) for t in tasks]
    return out


@router.delete("/{room_id}", status_code=204)
async def delete_room(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = await _get_room_or_404(db, room_id, current_user.id)
    await db.delete(room)


@router.put("/{room_id}")
async def update_room(
    room_id: uuid.UUID,
    body: UpdateRoomRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = await _get_room_or_404(db, room_id, current_user.id)
    if body.status is not None:
        room.status = body.status
    if body.participants is not None:
        room.participants = [p.model_dump() for p in body.participants]
    await db.flush()
    await db.refresh(room)
    tasks_result = await db.execute(
        select(DealRoomTask).where(DealRoomTask.deal_room_id == room_id)
    )
    return _room_out(room, tasks_result.scalars().all())


# ── Tasks ─────────────────────────────────────────────────────────────────────

@router.post("/{room_id}/tasks", status_code=201)
async def create_task(
    room_id: uuid.UUID,
    body: CreateTaskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_room_or_404(db, room_id, current_user.id)
    task = DealRoomTask(
        deal_room_id=room_id,
        title=body.title,
        assigned_to_email=body.assigned_to_email,
        due_date=body.due_date,
    )
    db.add(task)
    await db.flush()
    return _task_out(task)


@router.put("/{room_id}/tasks/{task_id}")
async def update_task(
    room_id: uuid.UUID,
    task_id: uuid.UUID,
    body: UpdateTaskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_room_or_404(db, room_id, current_user.id)
    result = await db.execute(
        select(DealRoomTask).where(
            and_(DealRoomTask.id == task_id, DealRoomTask.deal_room_id == room_id)
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if body.title is not None:
        task.title = body.title
    if body.assigned_to_email is not None:
        task.assigned_to_email = body.assigned_to_email
    if body.due_date is not None:
        task.due_date = body.due_date
    if body.status is not None:
        task.status = body.status
        if body.status == "complete" and not task.completed_at:
            task.completed_at = datetime.now(timezone.utc)
        elif body.status == "pending":
            task.completed_at = None

    await db.flush()
    return _task_out(task)


@router.delete("/{room_id}/tasks/{task_id}", status_code=204)
async def delete_task(
    room_id: uuid.UUID,
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_room_or_404(db, room_id, current_user.id)
    result = await db.execute(
        select(DealRoomTask).where(
            and_(DealRoomTask.id == task_id, DealRoomTask.deal_room_id == room_id)
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)


# ── Messages ──────────────────────────────────────────────────────────────────

@router.post("/{room_id}/messages", status_code=201)
async def send_message(
    room_id: uuid.UUID,
    body: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_room_or_404(db, room_id, current_user.id)
    if not body.content.strip():
        raise HTTPException(status_code=422, detail="Message content cannot be empty")
    msg = DealRoomMessage(
        deal_room_id=room_id,
        sender_user_id=current_user.id,
        sender_name=current_user.name or current_user.email,
        content=body.content.strip(),
    )
    db.add(msg)
    await db.flush()
    return _msg_out(msg)


@router.get("/{room_id}/messages")
async def get_messages(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_room_or_404(db, room_id, current_user.id)
    result = await db.execute(
        select(DealRoomMessage)
        .where(DealRoomMessage.deal_room_id == room_id)
        .order_by(DealRoomMessage.created_at)
    )
    return [_msg_out(m) for m in result.scalars().all()]


# ── Helper ────────────────────────────────────────────────────────────────────

async def _get_room_or_404(db: AsyncSession, room_id: uuid.UUID, user_id: uuid.UUID) -> DealRoom:
    result = await db.execute(
        select(DealRoom).where(
            and_(DealRoom.id == room_id, DealRoom.created_by_user_id == user_id)
        )
    )
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Deal room not found")
    return room
