# STRATA — Progress Log

## Sprint 2 — April 2026

### Completed

#### Task 1 — Intelligence Page Live Wiring
- `GET /properties/{id}/valuation` → Valuation tab (fair value range, confidence, comp set, methodology breakdown)
- `GET /properties/{id}/risk` → Risk tab (composite score, dimension scores, flags)
- `GET /properties/{id}/comps` → Comparable sales table in Valuation tab
- Loading skeletons while data fetches on each tab
- 404 handling redirects to search with toast notification
- `Ask Copilot` button links to `/copilot?property={id}`

#### Task 2 — Copilot Streaming (Claude API)
- `POST /copilot/chat` backend route with SSE streaming via `anthropic` SDK
- Model: `claude-sonnet-4-20250514`
- Property context injection into system prompt when `property_id` provided
- Frontend CopilotPage streams token-by-token as SSE arrives
- Property context banner when `?property=` URL param present
- "Ask Copilot" button on IntelligencePage navigates with property ID

#### Task 3 — Save Search + Watchlist
- Save Search modal on SearchPage — user enters name, POST to `/saved-searches`
- Watch/unwatch toggle on each property card (gold star when watched)
- Auto-creates "My Watchlist" on first watch if none exists
- Saved searches count + watchlist count in market sidebar
- `SavedSearch.name` added to backend model and schema

#### Task 4 — Map View
- `react-leaflet` + `leaflet` installed in `/web`
- `MapView` component with OpenStreetMap tiles (no API key)
- Custom SVG marker pins colored by deal score (green ≥70, amber 50–69, red <50)
- Clicking a pin highlights the card in the list and shows a popup with key metrics + Underwrite button
- Map bounds auto-fit when search results change
- View toggle switches between List only ↔ Map+List split (55/45)

#### Task 5 — Portfolio Real Holdings
- `GET/POST/PUT/DELETE /portfolio/holdings` verified end-to-end
- "Add Property" modal with all required fields (address, price, date, loan, rent, expenses, notes)
- "Update Actuals" button pre-fills modal for selected holding
- Empty state with centered CTA when no holdings exist
- Success toasts on save/update
- Fallback image `onError` handler for holdings without photos

#### Task 6 — Email Alerts (SendGrid)
- `alert_service.py` — HTML email via SendGrid with property table (max 5 per alert)
- `background/search_alerts.py` — re-runs saved searches, diffs against `last_notified_property_ids`
- APScheduler `AsyncIOScheduler` wired into FastAPI lifespan, runs every 6 hours
- `last_notified_property_ids` + `name` columns added to `saved_searches` model

#### Task 7 — FEMA Flood Zone Service
- `risk_service.get_flood_zone(lat, lon)` calls FEMA NFHL MapServer (no API key)
- Zone → risk label mapping (AE/A/AO → High, VE/V → Very High, X shaded → Moderate, X → Low)
- Flood zone badge on Risk tab (green/amber/red)
- Included in `/properties/{id}/risk` response as `flood_risk`

#### Task 8 — School Data Service
- `school_service.get_nearby_schools(lat, lon, radius_miles)` via NCES ArcGIS (no API key)
- Returns up to 10 schools sorted Elementary → Middle → High
- Charter/Magnet flags included
- Displayed on Intelligence page Overview tab (Nearby Schools panel)

#### Task 9 — Rent Estimate Service (RentCast)
- Updated `rent_service.get_rent_estimate(address, property_type, beds, baths, sqft)`
- RentCast AVM endpoint with proper spread-based confidence logic (High <15%, Medium <25%, Low else)
- Fallback: `sqft * 1.2` estimate with `source: "Estimate"` when key missing or API fails
- Live rent estimate shown on Overview tab sourced from API

#### Task 10 — Property Listings (RapidAPI)
- `property_service._search_rapidapi()` calls `realty-in-us.p.rapidapi.com`
- Maps all RapidAPI response fields to STRATA `PropertyResponse` schema
- Runs deal score + risk score calculation on every result
- Falls back to 6-property mock dataset when key absent

#### Task 11 — Wire All Data Sources into Property Endpoints
- `GET /properties/{id}` concurrently fetches flood risk, nearby schools, rent estimate via `asyncio.gather`
- `PropertyResponse` schema extended with `flood_risk`, `nearby_schools`, `rent_estimate`
- `GET /properties/{id}/risk` includes `flood_risk` dimension
- Frontend Intelligence page displays all three data sources

### Configuration
- `backend/.env` populated with: `ANTHROPIC_API_KEY`, `RAPIDAPI_KEY`, `RENTCAST_API_KEY`, `SENDGRID_API_KEY`
- `web/.env` set: `VITE_API_URL=http://localhost:8080`, `VITE_USE_MOCK=false`
- `apscheduler` and `anthropic` packages added to `requirements.txt`
- `react-leaflet`, `leaflet`, `@types/leaflet` added to web `package.json`

### Build Status
- `npx tsc --noEmit` — ✅ zero errors
- Backend import check — ✅ all routes load cleanly
- API smoke test — ✅ `/health` and `/properties/search` respond correctly
