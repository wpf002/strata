from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import properties, underwriting, portfolio, market, users, search
from .routers import copilot

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start APScheduler for background jobs
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from .background.search_alerts import run_saved_search_alerts

    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_saved_search_alerts, "interval", hours=6, id="search_alerts")
    scheduler.start()

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


@app.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment}
