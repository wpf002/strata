# STRATA Backend

FastAPI backend for the STRATA real estate intelligence platform.

## Stack

- **FastAPI** + Python 3.11
- **PostgreSQL** via asyncpg + SQLAlchemy async
- **Supabase Auth** (JWT validation)
- **Pydantic v2** for all request/response models
- **Alembic** for migrations

## Setup

### 1. Prerequisites

- Python 3.11+
- PostgreSQL 14+ running locally (or Supabase managed Postgres)

### 2. Create a virtual environment

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and Supabase credentials
```

Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | asyncpg connection string |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_JWT_SECRET` | Found in Supabase → Settings → API |
| `ATTOM_API_KEY` | Optional — property data enrichment |
| `RENTCAST_API_KEY` | Optional — rent estimates |
| `SENDGRID_API_KEY` | Optional — email alerts |

### 4. Create the database

```bash
createdb strata
```

### 5. Run migrations

```bash
cd backend
alembic upgrade head
```

### 6. Start the server

```bash
uvicorn backend.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

Interactive docs: `http://localhost:8000/docs`

## API Overview

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/auth/verify` | Validate Supabase JWT |
| GET | `/users/me` | Current user profile |
| PUT | `/users/me` | Update strategy settings |
| GET | `/properties/search` | Search with filters |
| GET | `/properties/{id}` | Property detail |
| GET | `/properties/{id}/comps` | Comparable sales |
| GET | `/properties/{id}/risk` | Risk assessment |
| GET | `/properties/{id}/valuation` | AVM valuation |
| POST | `/underwriting/calculate` | Run financial model |
| GET/POST | `/underwriting/scenarios` | Saved scenarios |
| GET | `/portfolio` | Portfolio summary |
| POST | `/portfolio/holdings` | Add holding |
| PUT/DELETE | `/portfolio/holdings/{id}` | Update/remove holding |
| GET | `/market/{geo_type}/{geo_id}` | Market data by zip or city |
| GET/POST/DELETE | `/saved-searches` | Saved searches |
| GET/POST | `/watchlists` | Watchlists |
| POST/DELETE | `/watchlists/{id}/properties/{pid}` | Manage watchlist members |

## Authentication

All endpoints except `/health` and `/auth/verify` require a Supabase JWT in the `Authorization: Bearer <token>` header.

## Graceful Degradation

If `ATTOM_API_KEY` or `RENTCAST_API_KEY` are not set, the API returns mock data rather than failing. Set them when ready to switch to live data.
