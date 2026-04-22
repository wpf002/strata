import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import get_settings
from .routers import properties, underwriting, portfolio, market, users, search
from .routers import copilot, clients

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
    log.info("Alert scheduler started. Next run: %s", next_run)

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


@app.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment}


class TestEmailRequest(BaseModel):
    email: str


@app.post("/alerts/test-email")
async def send_test_email(body: TestEmailRequest):
    from .services.alert_service import send_saved_search_alert
    mock_properties = [
        {
            "id": "p1", "address": "4521 Oak Creek Drive", "city": "Dallas", "state": "TX",
            "zip": "75201", "deal_score": 81, "price": 342000, "cap_rate": 6.4, "cash_flow": 312,
        }
    ]
    sent = await send_saved_search_alert(
        user_email=body.email,
        search_name="STRATA Test Alert",
        properties=mock_properties,
    )
    if not sent:
        raise HTTPException(
            status_code=503,
            detail="Email not sent. Check SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in backend/.env.",
        )
    return {"status": "sent", "to": body.email}
