import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import get_settings
from .routers import properties, underwriting, portfolio, market, users, search
from .routers import copilot, clients, reports, leads, client_portals
from .routers import markets as markets_router

settings = get_settings()
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from .background.search_alerts import run_saved_search_alerts
    from .background.keepalive import ping_supabase, KEEPALIVE_INTERVAL_HOURS

    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_saved_search_alerts, "interval", hours=6, id="search_alerts")
    # Keeps the Supabase project from auto-pausing. Fires once at startup too,
    # so a short-lived process still registers activity.
    scheduler.add_job(
        ping_supabase,
        "interval",
        hours=KEEPALIVE_INTERVAL_HOURS,
        id="supabase_keepalive",
        next_run_time=datetime.now(timezone.utc),
    )
    scheduler.start()

    job = scheduler.get_job("search_alerts")
    next_run = job.next_run_time if job else "unknown"
    print(f"Alert scheduler started. Next run: {next_run}", flush=True)
    print(f"Supabase keepalive every {KEEPALIVE_INTERVAL_HOURS}h", flush=True)

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
app.include_router(client_portals.router)
app.include_router(reports.router)
app.include_router(markets_router.router)
app.include_router(leads.router)


@app.get("/health")
async def health():
    from .background.keepalive import keepalive_status

    return {
        "status": "ok",
        "environment": settings.environment,
        "supabaseKeepalive": keepalive_status(),
    }


class TestEmailRequest(BaseModel):
    email: str


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
