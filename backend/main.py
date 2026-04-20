from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import properties, underwriting, portfolio, market, users, search

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: nothing blocking here — migrations run via Alembic CLI
    yield
    # Shutdown: dispose connection pool
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


@app.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment}
