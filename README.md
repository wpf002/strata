# STRATA — Real Estate Intelligence Platform

Bloomberg Terminal for real estate. Web + mobile.

## Structure

```
strata/
├── web/          React 18 + TypeScript + Vite + Tailwind CSS
├── mobile/       React Native (bare workflow, no Expo)
└── shared/       Types and utilities (referenced by both)
```

## Quick Start

### Web + API together
```bash
npm run install:all
npm run dev
# web → http://localhost:5174   api → http://localhost:8080
```

### Mobile
```bash
cd mobile
npm install
npx react-native run-ios    # or run-android — first read mobile/SETUP.md
```

## Environment

Create `web/.env.local`:
```
VITE_API_URL=
VITE_USE_MOCK=false
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable anon key>
```
`VITE_API_URL` stays empty in dev — Vite proxies API paths to the backend on
:8080 (see `web/vite.config.ts`). Set `VITE_USE_MOCK=true` to run the UI off
`src/data/mockData.ts` with no backend at all.

Create `mobile/.env`:
```
STRATA_API_URL=http://localhost:8000
STRATA_USE_MOCK=true
```

Backend secrets go in `backend/.env` (`DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_JWT_SECRET`, `ANTHROPIC_API_KEY`, `RAPIDAPI_KEY`, `RENTCAST_API_KEY`,
`SENDGRID_API_KEY`). All are git-ignored.

## Supabase

```bash
bin/check-supabase
```

Verifies the whole chain — env vars, project ref agreement, anon key signature,
DNS, GoTrue, PostgREST, Postgres, alembic — and names the broken link.

Free-tier projects **auto-pause when idle**, and a paused project stops resolving
in DNS, so everything fails at once in a way that looks like bad config. The
backend runs a keepalive ping every 12h to avoid that, reported at `GET /health`
— but only while the API is actually running. If it's been off for a while,
check the dashboard and resume the project there.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Mobile | React Native (bare), TypeScript |
| Backend | FastAPI, Python |
| Database | Supabase Postgres (Alembic migrations, RLS on all public tables) |
| Auth | Supabase Auth |
| Live data | RapidAPI (listings), RentCast (rents + markets), FEMA NFHL (flood), NCES (schools) |
| AI | Claude via the `anthropic` SDK (Copilot, memos, LP reports) |

## Built Screens

### Web
- **Search / Opportunity Feed** — investor filters, deal score ranking, list or map+list split, comparison modal
- **Property Intelligence** — 6-tab deep dive: overview, financials, valuation, risk, market, history
- **Underwrite** — live P&L model, all inputs are sliders, scenario analysis, DSCR check, strategy modes
- **Portfolio** — equity tracking, cash flow charts, concentration analysis, hold/refi/sell recommendations
- **Copilot** — streaming Claude chat with property context, suggested prompts, conversation history
- **Market Pulse** — 5 markets with regime classification and trend metrics
- **Clients / Leads / Client Portals** — CRM layer, transaction timelines, shareable client-facing portals
- **Watchlist · Alerts · Reports · Settings**

### Mobile
- **Search Screen** — opportunity feed with deal scores, risk flags, quick actions
- **Underwrite Screen** — full live underwriting engine with native sliders
- **Intelligence · Portfolio · Copilot** screens, bottom tab navigation

Saved-search alerts are email-only (SendGrid). There is no push notification
channel — Firebase was removed; see the Sprint 8 notes in `PROGRESS.md`.

## Next Steps
1. Verify the native mobile builds on device (see `mobile/SETUP.md`)
2. Mobile map view redesign and touch-interaction polish
3. Broader MLS coverage beyond the current market list
