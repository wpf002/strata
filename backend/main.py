import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import get_settings
from .routers import properties, underwriting, portfolio, market, users, search
from .routers import copilot, clients, reports, leads
from .routers import markets as markets_router

settings = get_settings()
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from .background.search_alerts import run_saved_search_alerts

    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_saved_search_alerts, "interval", hours=6, id="search_alerts")
    scheduler.start()

    job = scheduler.get_job("search_alerts")
    next_run = job.next_run_time if job else "unknown"
    print(f"Alert scheduler started. Next run: {next_run}", flush=True)

    yield

    scheduler.shutdown(wait=False)
    from .database import engine
    await engine.dispose()


app = FastAPI(
    title="STRATA API",
    description="Real estate intelligence platform backend",
    version="1.0.0",
    lifespan=lifespan,
)

_dev_origins = settings.environment == "development"
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _dev_origins else [
        "https://strata.app",
    ],
    allow_credentials=not _dev_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(users.router)
app.include_router(properties.router)
app.include_router(underwriting.router)
app.include_router(portfolio.router)
app.include_router(market.router)
app.include_router(search.router)
app.include_router(copilot.router)
app.include_router(clients.router)
app.include_router(reports.router)
app.include_router(markets_router.router)
app.include_router(leads.router)


@app.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment}


class TestEmailRequest(BaseModel):
    email: str


class TestPushRequest(BaseModel):
    user_id: str


@app.post("/alerts/test-push")
async def send_test_push(body: TestPushRequest):
    import uuid as _uuid
    from .database import get_db as _get_db
    from .models.user import User as _User
    from sqlalchemy import select as _select
    from .services.alert_service import send_push_notification

    try:
        _uid = _uuid.UUID(body.user_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid user_id format")

    async for db in _get_db():
        result = await db.execute(_select(_User).where(_User.id == _uid))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if not user.push_token:
            raise HTTPException(status_code=400, detail="User has no registered push token")

        sent = await send_push_notification(
            push_token=user.push_token,
            platform=user.push_platform or "ios",
            title="STRATA Test Push",
            body="Your push notifications are working correctly.",
            data={"type": "test"},
        )
        return {"sent": sent, "token": user.push_token[:12] + "…"}



@app.post("/alerts/test-email")
async def send_test_email(body: TestEmailRequest):
    import httpx as _httpx
    _settings = get_settings()

    if not _settings.sendgrid_api_key:
        raise HTTPException(status_code=503, detail="SENDGRID_API_KEY not set in backend/.env")

    payload = {
        "personalizations": [{"to": [{"email": body.email}]}],
        "from": {"email": _settings.sendgrid_from_email, "name": "STRATA Alerts"},
        "subject": "STRATA — Test Alert",
        "content": [{"type": "text/html", "value": (
            "<body style='background:#0f172a;font-family:sans-serif;padding:40px'>"
            "<h1 style='color:#c9a84c'>STRATA</h1>"
            "<p style='color:#f1f5f9'>Your email alerts are configured correctly. "
            "You'll receive property matches here when new listings hit your saved searches.</p>"
            "</body>"
        )}],
    }
    try:
        async with _httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.sendgrid.com/v3/mail/send",
                json=payload,
                headers={"Authorization": f"Bearer {_settings.sendgrid_api_key}"},
            )
    except _httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Network error contacting SendGrid: {exc}")

    if resp.status_code in (200, 202):
        return {"status": "sent", "to": body.email}

    # Surface the real SendGrid error so it's actionable
    try:
        sg_errors = resp.json().get("errors", [])
        detail = sg_errors[0]["message"] if sg_errors else resp.text[:300]
    except Exception:
        detail = resp.text[:300]

    status = 400 if resp.status_code == 403 else 502
    raise HTTPException(status_code=status, detail=f"SendGrid error: {detail}")
