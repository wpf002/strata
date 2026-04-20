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

### Web
```bash
cd web
npm install
npm run dev
# → http://localhost:5173
```

### Mobile
```bash
cd mobile
npm install
npx react-native run-ios    # or run-android
```

## Environment

Create `web/.env.local`:
```
VITE_API_URL=http://localhost:8000
VITE_USE_MOCK=true
```

Create `mobile/.env`:
```
STRATA_API_URL=http://localhost:8000
STRATA_USE_MOCK=true
```

Set `VITE_USE_MOCK=false` / `STRATA_USE_MOCK=false` once the FastAPI backend is running.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Mobile | React Native (bare), TypeScript |
| Backend (next) | FastAPI, Python |
| Database (next) | PostgreSQL + PostGIS |
| Auth (next) | Supabase Auth / Auth0 |

## Built Screens

### Web
- **Search / Opportunity Feed** — investor filters, deal score ranking, live market sidebar
- **Property Intelligence** — 6-tab deep dive: overview, financials, valuation, risk, market, history
- **Underwrite** — live P&L model, all inputs are sliders, scenario analysis, DSCR check
- **Portfolio** — equity tracking, cash flow charts, concentration analysis, hold/refi/sell recommendations
- **Copilot** — AI chat interface for property Q&A and deal analysis

### Mobile
- **Search Screen** — opportunity feed with deal scores, risk flags, quick actions
- **Underwrite Screen** — full live underwriting engine with native sliders

## Next Steps
1. FastAPI backend with PostgreSQL
2. Real MLS/property data via ATTOM or Estated
3. User auth + saved searches
4. Market Pulse dashboard
5. STRATA Teams (agent tools)
